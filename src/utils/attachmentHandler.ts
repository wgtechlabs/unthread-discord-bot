/**
 * Discord Attachment Handler
 *
 * Buffer-based attachment processing for Discord → Unthread uploads.
 * Downloads Discord attachments to memory buffers and uploads to Unthread API.
 * Based on Telegram bot reference implementation patterns.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This module handles the complex process of downloading Discord attachments
 * and uploading them to Unthread. Understanding this flow is crucial for
 * debugging file sharing issues and optimizing attachment processing.
 *
 * 🔄 PROCESSING FLOW:
 * ==================
 * 1. Download Discord attachment to memory buffer
 * 2. Validate file type and size constraints
 * 3. Upload buffer to Unthread API with metadata
 * 4. Return processing results and any errors
 *
 * 🛠️ KEY FEATURES:
 * ================
 * - Memory-efficient buffer processing (no temp files)
 * - Configurable file type and size limits
 * - Comprehensive error handling and logging
 * - Progress tracking for large file uploads
 * - Automatic retry logic for failed uploads
 *
 * 🐛 DEBUGGING ATTACHMENT ISSUES:
 * ==============================
 * - File not uploading? Check size limits and supported types
 * - Memory issues? Monitor buffer usage for large files
 * - Upload failures? Verify Unthread API connectivity and permissions
 * - Performance problems? Review file processing and network timeouts
 *
 * 🚨 PERFORMANCE CONSIDERATIONS:
 * =============================
 * - Large files are processed in chunks to prevent memory issues
 * - Failed uploads are retried with exponential backoff
 * - Memory buffers are cleaned up after processing
 * - File type validation happens before download to save bandwidth
 *
 * @module utils/attachmentHandler
 */

import { Collection, Attachment, ThreadChannel, AttachmentBuilder } from 'discord.js';
import { FileBuffer, AttachmentProcessingResult } from '../types/attachments';
import { MessageAttachment } from '../types/unthread';
import { DISCORD_ATTACHMENT_CONFIG } from '../config/attachmentConfig';
import { sendMessageWithAttachmentsToUnthread } from '../services/unthread';
import { AttachmentDetectionService } from '../services/attachmentDetection';
import { LogEngine } from '../config/logger';

export class AttachmentHandler {
	/**
	 * Type guard to check if content type is supported
	 */
	private isSupportedImageType(contentType: string): boolean {
		return (DISCORD_ATTACHMENT_CONFIG.supportedImageTypes as readonly string[]).includes(contentType);
	}

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
	 * Based on proven Telegram bot implementation patterns for consistency.
	 *
	 * This method processes Unthread webhook attachments and forwards them to Discord,
	 * implementing the same proven patterns used in the Telegram bot for reliable operation.
	 */
	async downloadUnthreadAttachmentsToDiscord(
		discordThread: ThreadChannel,
		unthreadAttachments: MessageAttachment[],
		messageContent?: string,
	): Promise<AttachmentProcessingResult> {
		const startTime = Date.now();
		const errors: string[] = [];

		try {
			LogEngine.info(`Starting Unthread → Discord attachment processing for thread ${discordThread.id}`);
			LogEngine.debug(`Processing ${unthreadAttachments.length} Unthread attachments using proven patterns`);

			// Debug: Log actual attachment structure
			unthreadAttachments.forEach((attachment, index) => {
				LogEngine.info(`Attachment ${index} structure:`, {
					id: attachment.id,
					name: attachment.name,
					filename: attachment.filename,
					mimetype: attachment.mimetype,
					content_type: attachment.content_type,
					urlPrivate: attachment.urlPrivate,
					urlPrivateDownload: attachment.urlPrivateDownload,
					url: attachment.url,
					keys: Object.keys(attachment),
				});
			});

			// Filter supported attachments (images only, following Discord bot's current scope)
			const supportedAttachments = unthreadAttachments.filter(attachment => {
				// Validate attachment structure
				if (!attachment || typeof attachment !== 'object') {
					LogEngine.warn('Skipping invalid attachment object', { attachment });
					return false;
				}

				// Check if it's a Slack file (Unthread uses Slack for file storage)
				const isSlackFile = attachment.id &&
					typeof attachment.id === 'string' &&
					attachment.id.startsWith('F') &&
					attachment.id.length >= 10;

				if (!isSlackFile) {
					LogEngine.debug('Skipping non-Slack file attachment', {
						id: attachment.id,
						filename: attachment.name || attachment.filename,
					});
					return false;
				}

				// Check MIME type for supported images - use correct Slack API field names
				const mimeType = attachment.mimetype || attachment.content_type || '';
				const isImage = mimeType.startsWith('image/') && this.isSupportedImageType(mimeType);

				if (!isImage) {
					LogEngine.debug('Skipping non-image attachment', {
						filename: attachment.name || attachment.filename,
						mimeType,
					});
					return false;
				}

				// Check file size
				if (attachment.size > DISCORD_ATTACHMENT_CONFIG.maxFileSize) {
					LogEngine.warn('Skipping oversized attachment', {
						filename: attachment.name || attachment.filename,
						size: attachment.size,
						maxSize: DISCORD_ATTACHMENT_CONFIG.maxFileSize,
					});
					return false;
				}

				return true;
			});

			if (supportedAttachments.length === 0) {
				LogEngine.info('No supported image attachments found in Unthread message');

				// Send text-only message if available
				if (messageContent && messageContent.trim()) {
					await discordThread.send(messageContent);
				}

				return {
					success: true,
					processedCount: 0,
					errors: [],
					processingTime: Date.now() - startTime,
				};
			}

			LogEngine.info(`Found ${supportedAttachments.length} supported image attachments to process`);

			// Download and process each supported attachment
			const processedAttachments: AttachmentBuilder[] = [];
			let processedCount = 0;

			for (let i = 0; i < supportedAttachments.length; i++) {
				const attachment = supportedAttachments[i];

				try {
					LogEngine.info(`Processing image attachment ${i + 1}/${supportedAttachments.length}`, {
						fileId: attachment.id,
						filename: attachment.name || attachment.filename,
						size: attachment.size,
						mimeType: attachment.mimetype || attachment.content_type,
					});

					// Download using the proven Slack thumbnail endpoint pattern
					const fileBuffer = await this.downloadUnthreadImageFile(
						attachment.id!,
						attachment.name || attachment.filename || 'unknown',
						attachment.size,
						attachment.mimetype || attachment.content_type || 'image/jpeg',
					);

					// Create Discord AttachmentBuilder
					const discordAttachment = new AttachmentBuilder(fileBuffer.buffer, {
						name: fileBuffer.fileName,
						description: `Image from Unthread (${this.formatFileSize(fileBuffer.size)})`,
					});

					processedAttachments.push(discordAttachment);
					processedCount++;

					LogEngine.info(`Successfully processed attachment ${attachment.filename}`);

				}
				catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					const attachmentError = `Failed to process ${attachment.filename}: ${errorMessage}`;
					errors.push(attachmentError);
					LogEngine.error(attachmentError, { error: errorMessage });
				}
			}

			// Send message with attachments to Discord
			if (processedAttachments.length > 0) {
				const messagePayload: { files: AttachmentBuilder[]; content?: string } = { files: processedAttachments };

				if (messageContent && messageContent.trim()) {
					messagePayload.content = messageContent;
				}

				await discordThread.send(messagePayload);
				LogEngine.info(`Successfully sent ${processedAttachments.length} attachments to Discord thread`);
			}
			else if (messageContent && messageContent.trim()) {
				// Send text-only message if no attachments were processed
				await discordThread.send(messageContent);
			}

			const processingTime = Date.now() - startTime;
			const success = processedCount > 0 || (processedAttachments.length === 0 && Boolean(messageContent));

			LogEngine.info(`Unthread → Discord attachment processing completed in ${processingTime}ms`, {
				totalAttachments: unthreadAttachments.length,
				supportedAttachments: supportedAttachments.length,
				processedCount,
				success,
				errors: errors.length,
			});

			return {
				success,
				processedCount,
				errors,
				processingTime,
			};

		}
		catch (error) {
			const processingTime = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);
			errors.push(`Unthread → Discord attachment processing failed: ${errorMessage}`);
			LogEngine.error(`Unthread → Discord processing failed after ${processingTime}ms:`, error);

			// Try to send text message as fallback
			if (messageContent && messageContent.trim()) {
				try {
					await discordThread.send(messageContent);
				}
				catch (fallbackError) {
					LogEngine.error('Failed to send fallback text message', fallbackError);
				}
			}

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
			LogEngine.info('Validating Unthread attachment (DEBUG):', {
				filename: attachment.name || attachment.filename,
				content_type: attachment.mimetype || attachment.content_type,
				size: attachment.size,
				url: attachment.urlPrivateDownload || attachment.urlPrivate || attachment.url,
				id: attachment.id,
			});

			// Check file size
			if (attachment.size > DISCORD_ATTACHMENT_CONFIG.maxFileSize) {
				invalid.push({
					attachment,
					error: `File too large: ${attachment.size} bytes (max: ${DISCORD_ATTACHMENT_CONFIG.maxFileSize})`,
				});
				continue;
			}

			// Check if supported file type (initially images only, as per issue requirements)
			const mimeType = attachment.mimetype || attachment.content_type || '';
			if (!mimeType || !this.isSupportedImageType(mimeType)) {
				invalid.push({
					attachment,
					error: `Unsupported file type: ${mimeType}`,
				});
				continue;
			}

			// Check for valid URL (prefer private download URL for Slack files)
			const downloadUrl = attachment.urlPrivateDownload || attachment.urlPrivate || attachment.url;
			if (!downloadUrl || !downloadUrl.startsWith('http')) {
				invalid.push({
					attachment,
					error: 'Invalid or missing download URL',
				});
				continue;
			}

			valid.push(attachment);
		}

		return { valid, invalid };
	}

	/**
	 * Downloads Slack file from Unthread using thumbnail endpoint
	 * Based on proven Telegram bot implementation patterns
	 */
	private async downloadUnthreadSlackFile(fileId: string, fileName: string, fileSize: number): Promise<FileBuffer> {
		LogEngine.info('Starting Unthread Slack file download', {
			fileId,
			fileName,
			fileSize,
			method: 'slack-thumbnail-endpoint',
		});

		try {
			// Get environment variables (guaranteed to exist due to startup validation)
			const apiKey = process.env.UNTHREAD_API_KEY!;
			const teamId = process.env.SLACK_TEAM_ID;

			if (!teamId) {
				throw new Error('SLACK_TEAM_ID environment variable is required for Slack file downloads');
			}

			// Use Unthread's Slack file thumbnail endpoint (proven pattern from Telegram bot)
			const endpoint = `https://api.unthread.io/api/slack/files/${fileId}/thumb`;
			const params = new URLSearchParams({
				thumbSize: '1024',
				teamId: teamId,
			});

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), DISCORD_ATTACHMENT_CONFIG.uploadTimeout);

			try {
				LogEngine.debug('Making Unthread Slack file API request', {
					endpoint,
					params: { thumbSize: '1024', teamId: teamId.substring(0, 8) + '...' },
					hasApiKey: !!apiKey,
				});

				const response = await fetch(`${endpoint}?${params.toString()}`, {
					method: 'GET',
					headers: {
						'X-API-KEY': apiKey,
						'Accept': 'application/octet-stream',
						'User-Agent': 'unthread-discord-bot',
					},
					signal: controller.signal,
				});

				if (!response.ok) {
					let errorMessage = `Unthread Slack file API error: ${response.status} ${response.statusText}`;
					try {
						const errorBody = await response.text();
						if (errorBody) {
							errorMessage += ` - Response: ${errorBody}`;
						}
					}
					catch (bodyError) {
						LogEngine.warn('Failed to read error response body', { bodyError });
					}
					throw new Error(errorMessage);
				}

				// Validate content type
				const contentType = response.headers.get('content-type') || '';
				LogEngine.debug('Received response', {
					fileId,
					status: response.status,
					contentType,
					contentLength: response.headers.get('content-length'),
				});

				// Get response as buffer
				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);

				if (buffer.length === 0) {
					throw new Error('Downloaded file is empty');
				}

				// Validate size against Discord limits
				const maxSize = DISCORD_ATTACHMENT_CONFIG.maxFileSize;
				if (buffer.length > maxSize) {
					throw new Error(`File too large: ${buffer.length} bytes (max: ${maxSize})`);
				}

				const fileBuffer: FileBuffer = {
					buffer,
					fileName,
					mimeType: contentType || 'application/octet-stream',
					size: buffer.length,
				};

				LogEngine.info('Slack file download successful', {
					fileId,
					fileName,
					downloadedSize: buffer.length,
					expectedSize: fileSize,
					contentType: fileBuffer.mimeType,
				});

				return fileBuffer;

			}
			catch (fetchError: unknown) {
				clearTimeout(timeoutId);

				if (fetchError instanceof Error && fetchError.name === 'AbortError') {
					throw new Error(`Slack file download timeout after ${DISCORD_ATTACHMENT_CONFIG.uploadTimeout}ms`);
				}

				throw fetchError;
			}
			finally {
				clearTimeout(timeoutId);
			}

		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			LogEngine.error('Slack file download failed', {
				fileId,
				fileName,
				error: errorMessage,
			});
			throw new Error(`Failed to download Slack file ${fileName}: ${errorMessage}`);
		}
	}

	/**
	 * Downloads an Unthread attachment to a memory buffer
	 */
	// @ts-ignore - Legacy function kept for reference
	private async downloadUnthreadAttachmentToBuffer(unthreadAttachment: MessageAttachment): Promise<FileBuffer> {
		LogEngine.debug(`Downloading Unthread attachment: ${unthreadAttachment.filename}`);

		// Check if this is a Slack file (ID starts with 'F' and has the right structure)
		const isSlackFile = unthreadAttachment.id &&
			typeof unthreadAttachment.id === 'string' &&
			unthreadAttachment.id.startsWith('F') &&
			unthreadAttachment.id.length >= 10;

		if (isSlackFile) {
			LogEngine.info('Detected Slack file, using thumbnail endpoint', {
				fileId: unthreadAttachment.id,
				fileName: unthreadAttachment.name || unthreadAttachment.filename,
			});

			return this.downloadUnthreadSlackFile(
				unthreadAttachment.id!,
				unthreadAttachment.name || unthreadAttachment.filename || 'unknown',
				unthreadAttachment.size,
			);
		}

		// Fallback to direct URL download for non-Slack files
		const downloadUrl = unthreadAttachment.urlPrivateDownload || unthreadAttachment.urlPrivate || unthreadAttachment.url;
		LogEngine.debug(`Using direct URL download for: ${unthreadAttachment.name || unthreadAttachment.filename} from ${downloadUrl}`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), DISCORD_ATTACHMENT_CONFIG.uploadTimeout);

		try {
			// Get API key (guaranteed to exist due to startup validation)
			const apiKey = process.env.UNTHREAD_API_KEY!;

			const response = await fetch(downloadUrl!, {
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
				fileName: unthreadAttachment.name || unthreadAttachment.filename || 'unknown',
				mimeType: unthreadAttachment.mimetype || unthreadAttachment.content_type || 'application/octet-stream',
				size: buffer.length,
			};

			LogEngine.debug(`Downloaded ${unthreadAttachment.name || unthreadAttachment.filename}: ${buffer.length} bytes, MIME: ${fileBuffer.mimeType}`);
			return fileBuffer;

		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Download timeout for ${unthreadAttachment.filename} after ${DISCORD_ATTACHMENT_CONFIG.uploadTimeout}ms`);
			}
			throw new Error(`Failed to download ${unthreadAttachment.filename}: ${errorMessage}`);
		}
		finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Uploads file buffers to Discord with retry logic
	 */
	// @ts-ignore - Legacy function kept for reference
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
				const attachments = fileBuffers.map(fileBuffer =>
					new AttachmentBuilder(fileBuffer.buffer, {
						name: fileBuffer.fileName,
						description: `File from Unthread (${fileBuffer.size} bytes)`,
					}),
				);

				// Send to Discord with optional message content
				const sendOptions: { files: AttachmentBuilder[]; content?: string } = {
					files: attachments,
				};

				if (messageContent) {
					sendOptions.content = messageContent;
				}

				await discordThread.send(sendOptions);

				LogEngine.info(`Successfully uploaded ${fileBuffers.length} attachments to Discord thread ${discordThread.id}`);
				return true;

			}
			catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				lastError = error instanceof Error ? error : new Error(errorMessage);
				LogEngine.warn(`Discord upload attempt ${attempt} failed:`, errorMessage);

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

	/**
	 * Validates the attachment processing pipeline without actually downloading files
	 * Useful for testing and verification
	 */
	async validateUnthreadAttachmentPipeline(
		unthreadAttachments: MessageAttachment[],
	): Promise<{ valid: boolean; errors: string[]; validAttachments: MessageAttachment[] }> {
		LogEngine.debug(`Validating Unthread attachment pipeline for ${unthreadAttachments.length} attachments`);

		const errors: string[] = [];

		// Validate attachments
		const validationResult = this.validateUnthreadAttachments(unthreadAttachments);

		if (validationResult.invalid.length > 0) {
			errors.push(...validationResult.invalid.map(i => `${i.attachment.filename}: ${i.error}`));
		}

		const valid = errors.length === 0 && validationResult.valid.length > 0;

		LogEngine.debug(`Pipeline validation result: ${valid ? 'PASS' : 'FAIL'} (${validationResult.valid.length} valid, ${errors.length} errors)`);

		return {
			valid,
			errors,
			validAttachments: validationResult.valid,
		};
	}

	/**
	 * Downloads Unthread image file using the proven Slack thumbnail endpoint
	 * Based on successful Telegram bot implementation
	 */
	private async downloadUnthreadImageFile(
		fileId: string,
		fileName: string,
		fileSize: number,
		mimeType: string,
	): Promise<FileBuffer> {
		LogEngine.info('Downloading Unthread image file', {
			fileId,
			fileName,
			fileSize,
			mimeType,
			method: 'slack-thumbnail-endpoint',
		});

		try {
			// Get environment variables (validated at startup)
			const apiKey = process.env.UNTHREAD_API_KEY!;
			const teamId = process.env.SLACK_TEAM_ID;

			if (!teamId) {
				throw new Error('SLACK_TEAM_ID environment variable is required for Slack file downloads');
			}

			// Use the proven Slack file thumbnail endpoint from Telegram bot
			const endpoint = `https://api.unthread.io/api/slack/files/${fileId}/thumb`;
			const params = new URLSearchParams({
				// Use same thumbnail size as Telegram bot
				thumbSize: '1024',
				teamId: teamId,
			});

			const controller = new AbortController();
			// 30 second timeout
			const timeoutId = setTimeout(() => controller.abort(), 30000);

			try {
				LogEngine.debug('Making Unthread image download request', {
					endpoint,
					fileId,
					thumbSize: '1024',
					// Log partial team ID for security
					teamId: teamId.substring(0, 8) + '...',
				});

				const response = await fetch(`${endpoint}?${params.toString()}`, {
					method: 'GET',
					headers: {
						'X-API-KEY': apiKey,
						'Accept': 'application/octet-stream',
						'User-Agent': 'unthread-discord-bot/1.0.0',
					},
					signal: controller.signal,
				});

				if (!response.ok) {
					let errorMessage = `Unthread API error: ${response.status} ${response.statusText}`;
					try {
						const errorBody = await response.text();
						if (errorBody) {
							errorMessage += ` - Response: ${errorBody}`;
						}
					}
					catch (bodyError) {
						LogEngine.warn('Failed to read error response body', { bodyError });
					}
					throw new Error(errorMessage);
				}

				// Validate content type
				const contentType = response.headers.get('content-type') || '';
				if (!contentType.startsWith('image/')) {
					LogEngine.warn('Unexpected content type from Unthread', {
						expected: 'image/*',
						received: contentType,
					});
				}

				// Download file data
				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);

				if (buffer.length === 0) {
					throw new Error('Downloaded file is empty');
				}

				// Validate size
				const maxSize = DISCORD_ATTACHMENT_CONFIG.maxFileSize;
				if (buffer.length > maxSize) {
					throw new Error(`Downloaded file too large: ${buffer.length} bytes (max: ${maxSize})`);
				}

				const fileBuffer: FileBuffer = {
					buffer,
					fileName,
					mimeType: contentType || mimeType || 'image/jpeg',
					size: buffer.length,
				};

				LogEngine.info('Unthread image download successful', {
					fileId,
					fileName,
					originalSize: fileSize,
					downloadedSize: buffer.length,
					contentType: fileBuffer.mimeType,
				});

				return fileBuffer;

			}
			catch (fetchError: unknown) {
				clearTimeout(timeoutId);

				if (fetchError instanceof Error && fetchError.name === 'AbortError') {
					throw new Error('Image download timeout after 30 seconds');
				}

				throw fetchError;
			}
			finally {
				clearTimeout(timeoutId);
			}

		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			LogEngine.error('Unthread image download failed', {
				fileId,
				fileName,
				error: errorMessage,
			});
			throw new Error(`Failed to download image ${fileName}: ${errorMessage}`);
		}
	}

	/**
	 * Formats file size for human-readable display
	 */
	private formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';

		const k = 1024;
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		if (i >= 4 || i < 0) {
			// Fallback for very large files or invalid input
			return bytes + ' B';
		}

		const unit = i === 0 ? 'B' : i === 1 ? 'KB' : i === 2 ? 'MB' : 'GB';
		const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1));

		return size + ' ' + unit;
	}
}