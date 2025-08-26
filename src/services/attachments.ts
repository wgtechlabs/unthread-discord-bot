/**
 * Discord Attachment Handler
 *
 * Comprehensive file attachment processing system for the Discord bot with buffer-based
 * file handling, security validation, and Discord API integration. This implementation
 * follows the patterns established in the Telegram bot for consistency and reliability.
 *
 * Features:
 * - Buffer-based file processing for performance
 * - Multi-layer security validation with file signatures
 * - Discord-optimized upload handling
 * - Comprehensive error handling and retry logic
 * - Memory management and garbage collection optimization
 *
 * @module services/attachments
 */

import fetch, { Response } from 'node-fetch';
import * as mimeTypes from 'mime-types';
import { AttachmentBuilder, TextChannel, ThreadChannel } from 'discord.js';
import { LogEngine } from '../config/logger';
import { withRetry } from '../utils/retry';
import {
	DISCORD_ATTACHMENT_CONFIG,
	FILE_SIGNATURES,
	FileBuffer,
	BufferProcessingResult,
	FileValidationResult,
	SupportedMimeType,
} from '../config/attachments';

/**
 * Discord Attachment Handler Class
 *
 * Handles all file attachment processing for the Discord bot including downloading
 * files from Unthread, validating content, and uploading to Discord channels.
 */
export class DiscordAttachmentHandler {
	private readonly config = DISCORD_ATTACHMENT_CONFIG;
	private bufferPool: Buffer[] = [];
	private activeDownloads: Map<string, Promise<FileBuffer>> = new Map();

	/**
	 * Process file attachments from buffer data
	 *
	 * Downloads files from URLs, validates content and security, then uploads to Discord.
	 * Uses buffer-based processing for optimal memory usage and performance.
	 *
	 * @param fileIds - Array of file IDs/URLs to process
	 * @param channelId - Discord channel ID for uploads
	 * @param message - Optional message to send with files
	 * @returns Promise<BufferProcessingResult> Processing results and errors
	 */
	async processBufferAttachments(
		fileIds: string[],
		channelId: string,
		message?: string,
	): Promise<BufferProcessingResult> {
		const result: BufferProcessingResult = {
			success: false,
			processedCount: 0,
			failedCount: 0,
			totalSize: 0,
			errors: [],
			files: [],
		};

		LogEngine.info(`Processing ${fileIds.length} file attachments for channel ${channelId}`);

		// Validate file count limits
		if (fileIds.length > this.config.maxFiles) {
			result.errors.push(this.config.errors.tooManyFiles);
			return result;
		}

		// Process files with concurrency control
		const concurrentBatches = this.createConcurrentBatches(fileIds, this.config.maxConcurrentFiles);

		for (const batch of concurrentBatches) {
			const batchResults = await Promise.allSettled(
				batch.map(fileId => this.processSingleFile(fileId)),
			);

			for (const batchResult of batchResults) {
				if (batchResult.status === 'fulfilled' && batchResult.value) {
					const fileBuffer = batchResult.value;
					result.files.push(fileBuffer);
					result.processedCount++;
					result.totalSize += fileBuffer.size;
				}
				else {
					result.failedCount++;
					const error = batchResult.status === 'rejected'
						? batchResult.reason?.message || 'Unknown error'
						: 'File processing failed';
					result.errors.push(error);
				}
			}
		}

		// Validate total size limits
		if (result.totalSize > this.config.maxTotalSize) {
			result.errors.push(`Total file size (${this.formatBytes(result.totalSize)}) exceeds limit (${this.formatBytes(this.config.maxTotalSize)})`);
			return result;
		}

		// Upload files to Discord if any were processed successfully
		if (result.files.length > 0) {
			try {
				await this.uploadBuffersToDiscord(result.files, channelId, message);
				result.success = true;
				LogEngine.info(`Successfully uploaded ${result.files.length} files to Discord channel ${channelId}`);
			}
			catch (error) {
				result.errors.push(`Discord upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
				LogEngine.error('Discord upload failed:', error);
			}
		}

		// Trigger garbage collection hint for large operations
		if (this.config.enableGarbageCollectionHints && result.totalSize > this.config.memoryThreshold / 2) {
			if (global.gc) {
				global.gc();
				LogEngine.debug('Triggered garbage collection after large file operation');
			}
		}

		return result;
	}

	/**
	 * Process a single file from URL to validated buffer
	 *
	 * @param fileUrl - URL of file to download and process
	 * @returns Promise<FileBuffer> Processed file buffer with validation
	 */
	private async processSingleFile(fileUrl: string): Promise<FileBuffer> {
		// Check for cached/active downloads to avoid duplicates
		if (this.activeDownloads.has(fileUrl)) {
			LogEngine.debug(`Reusing active download for ${fileUrl}`);
			return await this.activeDownloads.get(fileUrl)!;
		}

		const downloadPromise = this.downloadAndValidateFile(fileUrl);
		this.activeDownloads.set(fileUrl, downloadPromise);

		try {
			const result = await downloadPromise;
			return result;
		}
		finally {
			this.activeDownloads.delete(fileUrl);
		}
	}

	/**
	 * Download file from URL and perform comprehensive validation
	 *
	 * @param fileUrl - URL to download from
	 * @returns Promise<FileBuffer> Validated file buffer
	 */
	private async downloadAndValidateFile(fileUrl: string): Promise<FileBuffer> {
		return await withRetry(
			async () => {
				LogEngine.debug(`Downloading file from: ${fileUrl}`);

				// Download file with timeout
				const response = await fetch(fileUrl, {
					// @ts-ignore - timeout is supported in node-fetch
					timeout: this.config.downloadTimeout,
					headers: {
						'User-Agent': 'Unthread-Discord-Bot/1.0',
					},
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				// Validate file metadata before download
				const { file, sanitizedFileName } = await this.validateFileMetadata(response, fileUrl);

				// Download file buffer
				const buffer = Buffer.from(await response.arrayBuffer());
				LogEngine.debug(`Downloaded ${buffer.length} bytes for file: ${sanitizedFileName}`);

				// Comprehensive validation
				const validation = await this.validateFileBuffer(buffer, sanitizedFileName, file.contentType);

				if (!validation.isValid) {
					throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
				}

				return {
					buffer,
					filename: file.name || sanitizedFileName,
					mimeType: validation.mimeType,
					size: buffer.length,
					originalUrl: fileUrl,
					sanitizedFilename: validation.sanitizedFilename,
					isValidSignature: true,
				};
			},
			{
				maxAttempts: this.config.retryAttempts,
				baseDelayMs: this.config.retryBaseDelay,
				operationName: `file download from ${fileUrl}`,
			},
		);
	}

	/**
	 * Validate file metadata from HTTP response
	 *
	 * @param response - HTTP response object
	 * @param fileUrl - Original file URL
	 * @returns Object with file metadata and sanitized filename
	 */
	private async validateFileMetadata(response: Response, fileUrl: string): Promise<{
		file: { contentType: string | null; name: string; size: number };
		sanitizedFileName: string;
	}> {
		const contentType = response.headers.get('content-type');
		const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

		// Extract filename from URL or Content-Disposition header
		const contentDisposition = response.headers.get('content-disposition');
		let filename = '';

		if (contentDisposition) {
			const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
			if (filenameMatch) {
				filename = filenameMatch[1].replace(/['"]/g, '');
			}
		}

		if (!filename) {
			filename = fileUrl.split('/').pop()?.split('?')[0] || 'attachment';
		}

		// Validate file size before download
		if (contentLength > this.config.maxFileSize) {
			throw new Error(this.config.errors.fileTooBig);
		}

		const sanitizedFileName = this.sanitizeFilename(filename);

		return {
			file: {
				contentType,
				name: filename,
				size: contentLength,
			},
			sanitizedFileName,
		};
	}

	/**
	 * Comprehensive file buffer validation
	 *
	 * @param buffer - File buffer to validate
	 * @param filename - Original filename
	 * @param contentType - HTTP Content-Type header
	 * @returns FileValidationResult with validation status and details
	 */
	private async validateFileBuffer(
		buffer: Buffer,
		filename: string,
		contentType: string | null,
	): Promise<FileValidationResult> {
		const result: FileValidationResult = {
			isValid: false,
			mimeType: '',
			sanitizedFilename: '',
			errors: [],
			size: buffer.length,
		};

		// Size validation
		if (buffer.length > this.config.maxFileSize) {
			result.errors.push(this.config.errors.fileTooBig);
		}

		if (buffer.length === 0) {
			result.errors.push('File is empty');
		}

		// Filename sanitization and validation
		result.sanitizedFilename = this.sanitizeFilename(filename);
		if (this.isDangerousFilename(result.sanitizedFilename)) {
			result.errors.push(this.config.errors.dangerousFilename);
		}

		// Enhanced MIME type detection
		result.mimeType = this.detectMimeTypeEnhanced(contentType, filename, buffer);

		// Format support validation
		if (!this.config.supportedFormats.includes(result.mimeType as SupportedMimeType)) {
			result.errors.push(this.config.errors.unsupportedFormat);
		}

		// File signature validation for security
		if (this.config.enableContentValidation) {
			const signatureValid = this.validateFileSignature(buffer, result.mimeType);
			if (!signatureValid) {
				result.errors.push(this.config.errors.invalidSignature);
			}
		}

		result.isValid = result.errors.length === 0;
		return result;
	}

	/**
	 * Enhanced MIME type detection using multiple sources
	 *
	 * @param contentType - HTTP Content-Type header
	 * @param filename - File name
	 * @param buffer - File buffer for signature detection
	 * @returns Detected MIME type
	 */
	private detectMimeTypeEnhanced(contentType: string | null, filename: string, buffer: Buffer): string {
		// Priority order: file signature > content-type > filename extension

		// 1. File signature detection (most reliable)
		for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
			for (const signature of signatures) {
				if (this.matchesSignature(buffer, signature)) {
					LogEngine.debug(`Detected MIME type from signature: ${mimeType}`);
					return mimeType;
				}
			}
		}

		// 2. Content-Type header
		if (contentType) {
			const normalizedType = contentType.split(';')[0].trim().toLowerCase();
			if (this.config.supportedFormats.includes(normalizedType as SupportedMimeType)) {
				LogEngine.debug(`Using Content-Type header: ${normalizedType}`);
				return normalizedType;
			}
		}

		// 3. File extension fallback
		const extensionMime = mimeTypes.lookup(filename);
		if (extensionMime && this.config.supportedFormats.includes(extensionMime as SupportedMimeType)) {
			LogEngine.debug(`Detected MIME type from extension: ${extensionMime}`);
			return extensionMime;
		}

		// 4. Handle JPEG variant
		if (contentType?.includes('jpg') || filename.toLowerCase().endsWith('.jpg')) {
			return 'image/jpeg';
		}

		LogEngine.warn(`Could not detect valid MIME type for file: ${filename}`);
		return 'application/octet-stream';
	}

	/**
	 * Validate file signature against known magic numbers
	 *
	 * @param buffer - File buffer
	 * @param mimeType - Expected MIME type
	 * @returns True if signature matches expected type
	 */
	private validateFileSignature(buffer: Buffer, mimeType: string): boolean {
		const signatures = FILE_SIGNATURES[mimeType as keyof typeof FILE_SIGNATURES];
		if (!signatures) {
			LogEngine.debug(`No signature validation available for MIME type: ${mimeType}`);
			return true; // Allow if no signature defined
		}

		return signatures.some(signature => this.matchesSignature(buffer, signature));
	}

	/**
	 * Check if buffer matches a specific file signature
	 *
	 * @param buffer - File buffer
	 * @param signature - Expected byte signature
	 * @returns True if signature matches
	 */
	private matchesSignature(buffer: Buffer, signature: readonly number[]): boolean {
		if (buffer.length < signature.length) {
			return false;
		}

		return signature.every((byte, index) => buffer[index] === byte);
	}

	/**
	 * Sanitize filename to prevent security issues
	 *
	 * @param filename - Original filename
	 * @returns Sanitized filename
	 */
	private sanitizeFilename(filename: string): string {
		if (!this.config.sanitizeFileNames) {
			return filename;
		}

		let sanitized = filename
			.replace(/[<>:"|?*]/g, '_') // Replace dangerous characters
			.replace(/\.\./g, '_') // Remove path traversal
			.replace(/[\x00-\x1f]/g, '') // Remove control characters
			.replace(/^\./, '_') // Remove leading dot
			.trim();

		// Ensure reasonable length
		if (sanitized.length > this.config.maxFilenameLength) {
			const ext = sanitized.substring(sanitized.lastIndexOf('.'));
			sanitized = sanitized.substring(0, this.config.maxFilenameLength - ext.length) + ext;
		}

		// Ensure we have a filename
		if (!sanitized || sanitized === '') {
			sanitized = 'attachment';
		}

		return sanitized;
	}

	/**
	 * Check if filename contains dangerous patterns
	 *
	 * @param filename - Filename to check
	 * @returns True if filename is dangerous
	 */
	private isDangerousFilename(filename: string): boolean {
		return this.config.dangerousFilenamePatterns.some(pattern => pattern.test(filename));
	}

	/**
	 * Upload multiple file buffers to Discord
	 *
	 * @param fileBuffers - Array of file buffers to upload
	 * @param channelId - Discord channel ID
	 * @param message - Optional message content
	 * @returns Promise<boolean> Success status
	 */
	async uploadBuffersToDiscord(
		fileBuffers: FileBuffer[],
		channelId: string,
		message?: string,
	): Promise<boolean> {
		if (fileBuffers.length === 1) {
			return await this.uploadSingleBufferToDiscord(fileBuffers[0], channelId, message);
		}
		else {
			return await this.uploadMultipleFilesToDiscord(fileBuffers, channelId, message);
		}
	}

	/**
	 * Upload a single file buffer to Discord
	 *
	 * @param fileBuffer - File buffer to upload
	 * @param channelId - Discord channel ID
	 * @param message - Optional message content
	 * @returns Promise<boolean> Success status
	 */
	async uploadSingleBufferToDiscord(
		fileBuffer: FileBuffer,
		channelId: string,
		message?: string,
	): Promise<boolean> {
		return await withRetry(
			async () => {
				if (!global.discordClient) {
					throw new Error('Discord client not available');
				}

				const channel = await global.discordClient.channels.fetch(channelId) as TextChannel | ThreadChannel;
				if (!channel) {
					throw new Error(`Channel ${channelId} not found`);
				}

				const attachment = new AttachmentBuilder(fileBuffer.buffer, {
					name: fileBuffer.sanitizedFilename,
				});

				const messageContent = message || `📎 File attachment: ${fileBuffer.sanitizedFilename}`;

				await channel.send({
					content: messageContent,
					files: [attachment],
				});

				LogEngine.info(`Successfully uploaded file ${fileBuffer.sanitizedFilename} to Discord channel ${channelId}`);
				return true;
			},
			{
				maxAttempts: this.config.retryAttempts,
				baseDelayMs: this.config.retryBaseDelay,
				operationName: `Discord upload of ${fileBuffer.sanitizedFilename}`,
			},
		);
	}

	/**
	 * Upload multiple files to Discord in a single message
	 *
	 * @param fileBuffers - Array of file buffers
	 * @param channelId - Discord channel ID
	 * @param message - Optional message content
	 * @returns Promise<boolean> Success status
	 */
	async uploadMultipleFilesToDiscord(
		fileBuffers: FileBuffer[],
		channelId: string,
		message?: string,
	): Promise<boolean> {
		return await withRetry(
			async () => {
				if (!global.discordClient) {
					throw new Error('Discord client not available');
				}

				const channel = await global.discordClient.channels.fetch(channelId) as TextChannel | ThreadChannel;
				if (!channel) {
					throw new Error(`Channel ${channelId} not found`);
				}

				const attachments = fileBuffers.map(buffer =>
					new AttachmentBuilder(buffer.buffer, {
						name: buffer.sanitizedFilename,
					}),
				);

				const fileList = fileBuffers.map(f => f.sanitizedFilename).join(', ');
				const messageContent = message || `📎 ${fileBuffers.length} file attachments: ${fileList}`;

				await channel.send({
					content: messageContent,
					files: attachments,
				});

				LogEngine.info(`Successfully uploaded ${fileBuffers.length} files to Discord channel ${channelId}`);
				return true;
			},
			{
				maxAttempts: this.config.retryAttempts,
				baseDelayMs: this.config.retryBaseDelay,
				operationName: `Discord upload of ${fileBuffers.length} files`,
			},
		);
	}

	/**
	 * Create concurrent processing batches
	 *
	 * @param items - Items to batch
	 * @param batchSize - Size of each batch
	 * @returns Array of batches
	 */
	private createConcurrentBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}

	/**
	 * Format bytes for human-readable display
	 *
	 * @param bytes - Number of bytes
	 * @returns Formatted string
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
}