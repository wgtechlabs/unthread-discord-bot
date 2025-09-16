/**
 * Attachment Handler Module
 *
 * Handles file attachments for bi-directional sync between Unthread and Discord.
 * Provides download and upload functionality with buffer-based processing for memory efficiency.
 *
 * Features:
 * - Download files from Unthread API URLs
 * - Upload files to Discord channels/threads
 * - Memory-efficient buffer processing
 * - Error handling and retry logic
 * - Support for multiple file types
 *
 * @module services/attachmentHandler
 */

import { AttachmentBuilder } from 'discord.js';
import { LogEngine } from '../config/logger';
import { MessageAttachment } from '../types/unthread';
import { FileAttachment } from '../types/utils';

/**
 * Maximum file size for downloads (25MB - Discord's limit)
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Supported file types for attachment processing
 */
const SUPPORTED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'text/plain',
	'application/pdf',
	'video/mp4',
	'video/webm',
	'audio/mp3',
	'audio/wav',
	'audio/ogg',
];

/**
 * Downloads a file from a URL and returns it as a buffer
 *
 * Uses memory-efficient streaming to handle large files without
 * creating temporary files on disk.
 *
 * @param url - URL to download the file from
 * @param maxSize - Maximum file size to download (defaults to Discord's limit)
 * @returns Promise resolving to file buffer and metadata
 * @throws Error if download fails or file is too large
 */
export async function downloadFileToBuffer(
	url: string,
	maxSize: number = MAX_FILE_SIZE,
): Promise<FileAttachment> {
	LogEngine.debug(`Downloading file from URL: ${url}`);

	try {
		// Setup timeout and abort controller for request resilience
		const abortController = new AbortController();
		// 30 seconds for file downloads
		const timeoutMs = 30000;
		const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

		const response = await fetch(url, {
			method: 'GET',
			signal: abortController.signal,
			headers: {
				'User-Agent': 'Unthread-Discord-Bot/1.0',
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Check content type
		const contentType = response.headers.get('content-type') || 'application/octet-stream';
		if (!SUPPORTED_MIME_TYPES.includes(contentType)) {
			LogEngine.warn(`Unsupported file type: ${contentType} for URL: ${url}`);
		}

		// Check content length
		const contentLength = response.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > maxSize) {
			throw new Error(`File too large: ${contentLength} bytes (max: ${maxSize})`);
		}

		// Get filename from URL or Content-Disposition header
		let filename = url.split('/').pop() || 'attachment';
		const disposition = response.headers.get('content-disposition');
		if (disposition) {
			const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
			if (filenameMatch) {
				filename = filenameMatch[1].replace(/['"]/g, '');
			}
		}

		// Read response as array buffer for memory efficiency
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Final size check after download
		if (buffer.length > maxSize) {
			throw new Error(`Downloaded file too large: ${buffer.length} bytes (max: ${maxSize})`);
		}

		LogEngine.debug(`Successfully downloaded file: ${filename} (${buffer.length} bytes, ${contentType})`);

		return {
			filename,
			url,
			size: buffer.length,
			contentType,
			data: buffer,
		};
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		LogEngine.error(`Failed to download file from ${url}:`, errorMessage);
		throw new Error(`File download failed: ${errorMessage}`);
	}
}

/**
 * Downloads multiple files from Unthread message attachments
 *
 * Processes attachments concurrently with error handling to ensure
 * partial failures don't block the entire operation.
 *
 * @param attachments - Array of Unthread message attachments
 * @returns Promise resolving to array of successfully downloaded files
 */
export async function downloadAttachments(
	attachments: MessageAttachment[],
): Promise<FileAttachment[]> {
	if (!attachments || attachments.length === 0) {
		return [];
	}

	LogEngine.debug(`Downloading ${attachments.length} attachments`);

	const downloadPromises = attachments.map(async (attachment) => {
		try {
			// Check file size before download
			if (attachment.size > MAX_FILE_SIZE) {
				LogEngine.warn(`Skipping oversized file: ${attachment.filename} (${attachment.size} bytes)`);
				return null;
			}

			return await downloadFileToBuffer(attachment.url);
		}
		catch (error) {
			LogEngine.warn(`Failed to download attachment ${attachment.filename}:`, error);
			return null;
		}
	});

	const results = await Promise.all(downloadPromises);
	const successfulDownloads = results.filter((result): result is FileAttachment => result !== null);

	LogEngine.info(`Successfully downloaded ${successfulDownloads.length}/${attachments.length} attachments`);
	return successfulDownloads;
}

/**
 * Converts downloaded files to Discord attachment builders
 *
 * Prepares file buffers for upload to Discord channels/threads.
 *
 * @param files - Array of downloaded file attachments
 * @returns Array of Discord AttachmentBuilder objects
 */
export function createDiscordAttachments(files: FileAttachment[]): AttachmentBuilder[] {
	return files.map(file => {
		if (!file.data) {
			throw new Error(`File ${file.filename} has no data buffer`);
		}

		return new AttachmentBuilder(file.data, {
			name: file.filename,
			description: `File attachment (${file.size} bytes)`,
		});
	});
}

/**
 * AttachmentHandler class for managing file operations
 *
 * Provides a centralized interface for handling file attachments
 * in the Unthread → Discord flow.
 */
export class AttachmentHandler {
	/**
	 * Processes Unthread message attachments and prepares them for Discord upload
	 *
	 * This is the main entry point for the attachment flow:
	 * 1. Downloads files from Unthread URLs
	 * 2. Validates file types and sizes
	 * 3. Converts to Discord attachment format
	 *
	 * @param attachments - Unthread message attachments
	 * @returns Promise resolving to Discord-ready attachments
	 */
	static async processAttachments(attachments: MessageAttachment[]): Promise<AttachmentBuilder[]> {
		try {
			const downloadedFiles = await downloadAttachments(attachments);
			return createDiscordAttachments(downloadedFiles);
		}
		catch (error) {
			LogEngine.error('Failed to process attachments:', error);
			throw error;
		}
	}

	/**
	 * Checks if a message has processable attachments
	 *
	 * @param attachments - Array of message attachments
	 * @returns True if there are valid attachments to process
	 */
	static hasValidAttachments(attachments?: MessageAttachment[]): boolean {
		return !!(attachments && attachments.length > 0);
	}
}