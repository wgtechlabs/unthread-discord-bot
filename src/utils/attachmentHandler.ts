/**
 * Discord Attachment Handler
 *
 * Buffer-based attachment processing for Discord → Unthread uploads.
 * Downloads Discord attachments to memory buffers and uploads to Unthread API.
 * Based on Telegram bot reference implementation patterns.
 *
 * @module utils/attachmentHandler
 */

import { Collection, Attachment } from 'discord.js';
import { FileBuffer, AttachmentProcessingResult } from '../types/attachments';
import { DISCORD_ATTACHMENT_CONFIG } from '../config/attachmentConfig';
import { sendMessageWithAttachmentsToUnthread } from '../services/unthread';
import { AttachmentDetectionService } from '../services/attachmentDetection';
import { LogEngine } from '../config/logger';

export class AttachmentHandler {
	/**
	 * Main method to upload Discord attachments to Unthread
	 */
	async uploadDiscordAttachmentsToUnthread(
		conversationId: string,
		discordAttachments: Collection<string, Attachment>,
		message: string,
		onBehalfOf: { name: string; email: string },
	): Promise<AttachmentProcessingResult> {
		const startTime = Date.now();
		const errors: string[] = [];

		try {
			LogEngine.info(`Starting attachment upload for conversation ${conversationId}`);
			LogEngine.debug(`Processing ${discordAttachments.size} attachments`);

			// Validate all attachments first
			const validation = AttachmentDetectionService.validateAttachments(discordAttachments);

			if (validation.invalid.length > 0) {
				const validationErrors = validation.invalid.map(i => `${i.attachment.name}: ${i.error}`);
				errors.push(...validationErrors);
				LogEngine.warn(`Found ${validation.invalid.length} invalid attachments:`, validationErrors);
			}

			if (validation.valid.length === 0) {
				LogEngine.warn('No valid attachments found after validation');
				return {
					success: false,
					processedCount: 0,
					errors: errors.length > 0 ? errors : ['No valid attachments found'],
					processingTime: Date.now() - startTime,
				};
			}

			// Download valid attachments to buffers
			const fileBuffers: FileBuffer[] = [];
			const downloadPromises = validation.valid.map(attachment =>
				this.downloadAttachmentToBuffer(attachment),
			);

			const downloadResults = await Promise.allSettled(downloadPromises);

			// Process download results
			for (let i = 0; i < downloadResults.length; i++) {
				const result = downloadResults[i];
				const attachment = validation.valid[i];

				if (result.status === 'fulfilled') {
					fileBuffers.push(result.value);
					LogEngine.debug(`Successfully downloaded ${attachment.name} (${attachment.size} bytes)`);
				}
				else {
					const error = `Failed to download ${attachment.name}: ${result.reason}`;
					errors.push(error);
					LogEngine.error(error);
				}
			}

			if (fileBuffers.length === 0) {
				LogEngine.error('No attachments were successfully downloaded');
				return {
					success: false,
					processedCount: 0,
					errors: errors.length > 0 ? errors : ['No attachments could be downloaded'],
					processingTime: Date.now() - startTime,
				};
			}

			// Upload buffers to Unthread
			const uploadSuccess = await this.uploadBuffersToUnthread(
				conversationId,
				fileBuffers,
				message,
				onBehalfOf,
			);

			const processingTime = Date.now() - startTime;
			LogEngine.info(`Attachment processing completed in ${processingTime}ms. Success: ${uploadSuccess}`);

			return {
				success: uploadSuccess,
				processedCount: fileBuffers.length,
				errors,
				processingTime,
			};

		}
		catch (error) {
			const processingTime = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);
			errors.push(`Attachment upload failed: ${errorMessage}`);
			LogEngine.error(`Attachment upload failed after ${processingTime}ms:`, error);
			return {
				success: false,
				processedCount: 0,
				errors,
				processingTime,
			};
		}
	}

	/**
	 * Downloads a Discord attachment to a memory buffer
	 */
	private async downloadAttachmentToBuffer(discordAttachment: Attachment): Promise<FileBuffer> {
		LogEngine.debug(`Downloading attachment: ${discordAttachment.name} from ${discordAttachment.url}`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), DISCORD_ATTACHMENT_CONFIG.uploadTimeout);

		try {
			const response = await fetch(discordAttachment.url, {
				method: 'GET',
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
			}

			// Get response as array buffer first
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Verify downloaded size matches expected size
			if (buffer.length !== discordAttachment.size) {
				LogEngine.warn(`Size mismatch for ${discordAttachment.name}: expected ${discordAttachment.size}, got ${buffer.length}`);
			}

			const fileBuffer: FileBuffer = {
				buffer,
				fileName: discordAttachment.name,
				mimeType: discordAttachment.contentType || 'application/octet-stream',
				size: buffer.length,
			};

			LogEngine.debug(`Downloaded ${discordAttachment.name}: ${buffer.length} bytes, MIME: ${fileBuffer.mimeType}`);
			return fileBuffer;

		}
		catch (error: any) {
			if (error.name === 'AbortError') {
				throw new Error(`Download timeout for ${discordAttachment.name} after ${DISCORD_ATTACHMENT_CONFIG.uploadTimeout}ms`);
			}
			throw new Error(`Failed to download ${discordAttachment.name}: ${error.message}`);
		}
		finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Uploads file buffers to Unthread API with retry logic
	 */
	private async uploadBuffersToUnthread(
		conversationId: string,
		fileBuffers: FileBuffer[],
		message: string,
		onBehalfOf: { name: string; email: string },
	): Promise<boolean> {
		const maxAttempts = DISCORD_ATTACHMENT_CONFIG.retry.maxAttempts;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				LogEngine.debug(`Upload attempt ${attempt}/${maxAttempts} for ${fileBuffers.length} files`);

				// Call the new Unthread service method
				const response = await sendMessageWithAttachmentsToUnthread(
					conversationId,
					onBehalfOf,
					message,
					fileBuffers,
				);

				if (response.success) {
					LogEngine.info(`Successfully uploaded ${fileBuffers.length} attachments to Unthread`);
					return true;
				}
				else {
					throw new Error(response.error || 'Upload failed without error message');
				}

			}
			catch (error: any) {
				lastError = error;
				LogEngine.warn(`Upload attempt ${attempt} failed:`, error.message);

				if (attempt < maxAttempts) {
					// Calculate exponential backoff delay
					const delay = Math.min(
						DISCORD_ATTACHMENT_CONFIG.retry.baseDelay * Math.pow(2, attempt - 1),
						DISCORD_ATTACHMENT_CONFIG.retry.maxDelay,
					);

					LogEngine.debug(`Retrying upload in ${delay}ms...`);
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		LogEngine.error(`All ${maxAttempts} upload attempts failed. Last error:`, lastError);
		return false;
	}
}