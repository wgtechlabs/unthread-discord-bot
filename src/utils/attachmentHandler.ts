/**
 * Discord Attachment Handler
 *
 * Buffer-based attachment processing for Discord → Unthread uploads.
 * Downloads Discord attachments to memory buffers and uploads to Unthread API.
 * Based on Telegram bot reference implementation patterns.
 *
 * @module utils/attachmentHandler
 */

import { Collection, Attachment, ThreadChannel } from 'discord.js';
import { FileBuffer, AttachmentProcessingResult } from '../types/attachments';
import { MessageAttachment } from '../types/unthread';
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

	/**
	 * Main method to download Unthread attachments and upload to Discord
	 * 
	 * Downloads files from Unthread API and uploads them to Discord thread/channel.
	 * Based on existing Discord → Unthread flow patterns for consistency.
	 */
	async downloadUnthreadAttachmentsToDiscord(
		discordThread: ThreadChannel,
		unthreadAttachments: MessageAttachment[],
		messageContent?: string,
	): Promise<AttachmentProcessingResult> {
		const startTime = Date.now();
		const errors: string[] = [];

		try {
			LogEngine.info(`Starting Unthread attachment download for Discord thread ${discordThread.id}`);
			LogEngine.debug(`Processing ${unthreadAttachments.length} Unthread attachments`);

			// Validate attachments before processing
			const validAttachments = this.validateUnthreadAttachments(unthreadAttachments);
			
			if (validAttachments.invalid.length > 0) {
				const validationErrors = validAttachments.invalid.map(i => `${i.attachment.filename}: ${i.error}`);
				errors.push(...validationErrors);
				LogEngine.warn(`Found ${validAttachments.invalid.length} invalid Unthread attachments:`, validationErrors);
			}

			if (validAttachments.valid.length === 0) {
				LogEngine.warn('No valid Unthread attachments found after validation');
				return {
					success: false,
					processedCount: 0,
					errors: errors.length > 0 ? errors : ['No valid attachments found'],
					processingTime: Date.now() - startTime,
				};
			}

			// Download valid attachments to buffers
			const fileBuffers: FileBuffer[] = [];
			const downloadPromises = validAttachments.valid.map(attachment =>
				this.downloadUnthreadAttachmentToBuffer(attachment),
			);

			const downloadResults = await Promise.allSettled(downloadPromises);

			// Process download results
			for (let i = 0; i < downloadResults.length; i++) {
				const result = downloadResults[i];
				const attachment = validAttachments.valid[i];

				if (result.status === 'fulfilled') {
					fileBuffers.push(result.value);
					LogEngine.debug(`Successfully downloaded ${attachment.filename} (${attachment.size} bytes)`);
				}
				else {
					const error = `Failed to download ${attachment.filename}: ${result.reason}`;
					errors.push(error);
					LogEngine.error(error);
				}
			}

			if (fileBuffers.length === 0) {
				LogEngine.error('No Unthread attachments were successfully downloaded');
				return {
					success: false,
					processedCount: 0,
					errors: errors.length > 0 ? errors : ['No attachments could be downloaded'],
					processingTime: Date.now() - startTime,
				};
			}

			// Upload buffers to Discord
			const uploadSuccess = await this.uploadBuffersToDiscord(
				discordThread,
				fileBuffers,
				messageContent,
			);

			const processingTime = Date.now() - startTime;
			LogEngine.info(`Unthread attachment processing completed in ${processingTime}ms. Success: ${uploadSuccess}`);

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
			errors.push(`Unthread attachment download failed: ${errorMessage}`);
			LogEngine.error(`Unthread attachment download failed after ${processingTime}ms:`, error);
			return {
				success: false,
				processedCount: 0,
				errors,
				processingTime,
			};
		}
	}

	/**
	 * Validates Unthread attachments before processing
	 */
	private validateUnthreadAttachments(attachments: MessageAttachment[]) {
		const valid: MessageAttachment[] = [];
		const invalid: Array<{ attachment: MessageAttachment; error: string }> = [];

		for (const attachment of attachments) {
			// Check file size
			if (attachment.size > DISCORD_ATTACHMENT_CONFIG.maxFileSize) {
				invalid.push({
					attachment,
					error: `File too large: ${attachment.size} bytes (max: ${DISCORD_ATTACHMENT_CONFIG.maxFileSize})`
				});
				continue;
			}

			// Check if supported file type (initially images only, as per issue requirements)
			if (!DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.includes(attachment.content_type as any)) {
				invalid.push({
					attachment,
					error: `Unsupported file type: ${attachment.content_type}`
				});
				continue;
			}

			// Check for valid URL
			if (!attachment.url || !attachment.url.startsWith('http')) {
				invalid.push({
					attachment,
					error: 'Invalid or missing download URL'
				});
				continue;
			}

			valid.push(attachment);
		}

		return { valid, invalid };
	}

	/**
	 * Downloads an Unthread attachment to a memory buffer
	 */
	private async downloadUnthreadAttachmentToBuffer(unthreadAttachment: MessageAttachment): Promise<FileBuffer> {
		LogEngine.debug(`Downloading Unthread attachment: ${unthreadAttachment.filename} from ${unthreadAttachment.url}`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), DISCORD_ATTACHMENT_CONFIG.uploadTimeout);

		try {
			// Get API key for authenticated download
			const apiKey = process.env.UNTHREAD_API_KEY;
			if (!apiKey) {
				throw new Error('UNTHREAD_API_KEY environment variable is required for downloading attachments');
			}

			const response = await fetch(unthreadAttachment.url, {
				method: 'GET',
				headers: {
					'X-API-KEY': apiKey,
					'User-Agent': 'unthread-discord-bot',
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Failed to download Unthread attachment: ${response.status} ${response.statusText}`);
			}

			// Get response as array buffer first
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Verify downloaded size matches expected size
			if (buffer.length !== unthreadAttachment.size) {
				LogEngine.warn(`Size mismatch for ${unthreadAttachment.filename}: expected ${unthreadAttachment.size}, got ${buffer.length}`);
			}

			const fileBuffer: FileBuffer = {
				buffer,
				fileName: unthreadAttachment.filename,
				mimeType: unthreadAttachment.content_type,
				size: buffer.length,
			};

			LogEngine.debug(`Downloaded ${unthreadAttachment.filename}: ${buffer.length} bytes, MIME: ${fileBuffer.mimeType}`);
			return fileBuffer;

		}
		catch (error: any) {
			if (error.name === 'AbortError') {
				throw new Error(`Download timeout for ${unthreadAttachment.filename} after ${DISCORD_ATTACHMENT_CONFIG.uploadTimeout}ms`);
			}
			throw new Error(`Failed to download ${unthreadAttachment.filename}: ${error.message}`);
		}
		finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Uploads file buffers to Discord with retry logic
	 */
	private async uploadBuffersToDiscord(
		discordThread: ThreadChannel,
		fileBuffers: FileBuffer[],
		messageContent?: string,
	): Promise<boolean> {
		const maxAttempts = DISCORD_ATTACHMENT_CONFIG.retry.maxAttempts;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				LogEngine.debug(`Discord upload attempt ${attempt}/${maxAttempts} for ${fileBuffers.length} files`);

				// Convert FileBuffers to Discord AttachmentBuilder format
				const { AttachmentBuilder } = await import('discord.js');
				const attachments = fileBuffers.map(fileBuffer => 
					new AttachmentBuilder(fileBuffer.buffer, { 
						name: fileBuffer.fileName,
						description: `File from Unthread (${fileBuffer.size} bytes)`
					})
				);

				// Send to Discord with optional message content
				const sendOptions: any = {
					files: attachments,
				};
				
				if (messageContent) {
					sendOptions.content = messageContent;
				}

				await discordThread.send(sendOptions);

				LogEngine.info(`Successfully uploaded ${fileBuffers.length} attachments to Discord thread ${discordThread.id}`);
				return true;

			}
			catch (error: any) {
				lastError = error;
				LogEngine.warn(`Discord upload attempt ${attempt} failed:`, error.message);

				if (attempt < maxAttempts) {
					// Calculate exponential backoff delay
					const delay = Math.min(
						DISCORD_ATTACHMENT_CONFIG.retry.baseDelay * Math.pow(2, attempt - 1),
						DISCORD_ATTACHMENT_CONFIG.retry.maxDelay,
					);

					LogEngine.debug(`Retrying Discord upload in ${delay}ms...`);
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		LogEngine.error(`All ${maxAttempts} Discord upload attempts failed. Last error:`, lastError);
		return false;
	}
}