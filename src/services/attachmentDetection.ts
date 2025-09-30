/**
 * Attachment Detection Service - Metadata-Driven Processing
 *
 * @description
 * Enhanced attachment detection system using metadata-first approach for improved
 * reliability and performance. Processes webhook events to determine attachment
 * handling strategy without iterating through file collections.
 *
 * @module services/attachmentDetection
 * @since 1.0.0
 *
 * @keyFunctions
 * - shouldProcessEvent(): Validates if event requires attachment processing
 * - getProcessingDecision(): Central attachment handling decision pipeline
 * - hasAttachments(): Quick metadata-based attachment detection
 * - isOversized(): File size validation using pre-calculated metadata
 * - hasSupportedImages(): Identifies processable image attachments
 *
 * @commonIssues
 * - Metadata inconsistency: Webhook metadata doesn't match actual files
 * - Size calculation errors: Incorrect total size or file count
 * - Type detection failures: Unsupported or misidentified file types
 * - Processing decision conflicts: Multiple conditions trigger simultaneously
 * - Discord limits: Files exceed Discord's attachment size restrictions
 *
 * @troubleshooting
 * - Validate webhook event structure and metadata presence
 * - Check DISCORD_ATTACHMENT_CONFIG for size and type limits
 * - Verify file type detection against supported formats
 * - Use validateConsistency() to ensure metadata accuracy
 * - Monitor Discord API responses for attachment upload failures
 * - Review processing decision logic for edge cases
 *
 * @performance
 * - Metadata-first processing eliminates file iteration overhead
 * - Pre-calculated totals enable instant size validation
 * - Type detection uses normalized content-type mapping
 * - Processing decisions cached per webhook event
 *
 * @dependencies Discord.js, DISCORD_ATTACHMENT_CONFIG, LogEngine
 *
 * @example Basic Usage
 * ```typescript
 * const decision = AttachmentDetectionService.getProcessingDecision(webhookEvent);
 * if (decision.shouldProcess && decision.hasSupportedImages) {
 *   // Process supported image attachments
 * }
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Full attachment processing pipeline
 * if (AttachmentDetectionService.shouldProcessEvent(event)) {
 *   const decision = AttachmentDetectionService.getProcessingDecision(event);
 *   const summary = AttachmentDetectionService.getAttachmentSummary(event);
 *   LogEngine.info(`Processing decision: ${decision.reason} - ${summary}`);
 * }
 * ```
 */

import { Collection, Attachment } from 'discord.js';
import { DISCORD_ATTACHMENT_CONFIG, isSupportedImageType, normalizeContentType } from '../config/attachmentConfig';
import { AttachmentValidationResult } from '../types/attachments';
import { EnhancedWebhookEvent } from '../types/unthread';
import { LogEngine } from '../config/logger';

/**
 * Processing decision result for attachment handling
 */
export interface AttachmentProcessingDecision {
	/** Whether the event should be processed */
	shouldProcess: boolean;
	/** Whether attachments are present */
	hasAttachments: boolean;
	/** Whether image attachments are present */
	hasImages: boolean;
	/** Whether supported images are present */
	hasSupportedImages: boolean;
	/** Whether unsupported attachments are present */
	hasUnsupported: boolean;
	/** Whether attachments exceed size limits */
	isOversized: boolean;
	/** Human-readable summary of attachments */
	summary: string;
	/** Reason for processing decision */
	reason: string;
}

export class AttachmentDetectionService {
	/**
	 * Validates if webhook event requires attachment processing
	 *
	 * @function shouldProcessEvent
	 * @param {EnhancedWebhookEvent} event - Webhook event with metadata
	 * @returns {boolean} True if event is dashboard→discord and needs processing
	 *
	 * @example
	 * ```typescript
	 * if (AttachmentDetectionService.shouldProcessEvent(event)) {
	 *   // Process attachments for this event
	 * }
	 * ```
	 */
	static shouldProcessEvent(event: EnhancedWebhookEvent): boolean {
		return event.sourcePlatform === 'dashboard' &&
			   event.targetPlatform === 'discord';
	}

	/**
	 * Detects presence of attachments using webhook metadata
	 *
	 * @function hasAttachments
	 * @param {EnhancedWebhookEvent} event - Webhook event with attachment metadata
	 * @returns {boolean} True if event has files and should be processed
	 *
	 * @example
	 * ```typescript
	 * const hasFiles = AttachmentDetectionService.hasAttachments(event);
	 * ```
	 */
	static hasAttachments(event: EnhancedWebhookEvent): boolean {
		return this.shouldProcessEvent(event) &&
			   event.attachments?.hasFiles === true;
	}

	/**
	 * Image-specific detection for enhanced attachment processing
	 * Uses metadata types array for instant categorization
	 */
	static hasImageAttachments(event: EnhancedWebhookEvent): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}

		return event.attachments?.types?.some(type =>
			type.startsWith('image/'),
		) ?? false;
	}

	/**
	 * Supported image type validation with configuration
	 * Only processes image types we can handle reliably
	 */
	static hasSupportedImages(event: EnhancedWebhookEvent): boolean {
		if (!this.hasImageAttachments(event)) {
			return false;
		}

		return event.attachments?.types?.some(t => isSupportedImageType(t.toLowerCase()))
			?? false;
	}

	/**
	 * Check for unsupported file types (non-images or unsupported images)
	 * Enables clear user communication about what we can't process yet
	 */
	static hasUnsupportedAttachments(event: EnhancedWebhookEvent): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}

		// If we have attachments but no supported images, they're unsupported
		return !this.hasSupportedImages(event);
	}

	/**
	 * Size validation using individual file size checks
	 * Discord's 8MB limit applies per file, not total size
	 */
	static isWithinSizeLimit(event: EnhancedWebhookEvent, maxSizeBytes: number): boolean {
		if (!this.hasAttachments(event)) {
			return true;
		}
		const files = event.data.files ?? [];
		if (files.length === 0) return true;
		return files.every(f => f.size <= maxSizeBytes);
	}

	/**
	 * Check if any individual file exceeds size limits
	 * Enables specific messaging for oversized files
	 */
	static isOversized(event: EnhancedWebhookEvent, maxSizeBytes: number): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}
		const files = event.data.files ?? [];
		if (files.length === 0) return false;
		return files.some(f => f.size > maxSizeBytes);
	}

	/**
	 * Get attachment summary for logging/UI
	 * Ready-to-use summary without manual calculation
	 */
	static getAttachmentSummary(event: EnhancedWebhookEvent): string {
		if (!this.hasAttachments(event)) {
			return 'No attachments';
		}

		const attachments = event.attachments;
		if (!attachments) {
			return 'No attachments';
		}

		const { fileCount, totalSize, types } = attachments;
		const sizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
		const typeList = types.join(', ');

		return `${fileCount} files (${sizeMB}MB) - ${typeList}`;
	}

	/**
	 * Get file count without array access
	 * Instant count from metadata
	 */
	static getFileCount(event: EnhancedWebhookEvent): number {
		return event.attachments?.fileCount || 0;
	}

	/**
	 * Get total size without calculation
	 * Pre-calculated size from metadata
	 */
	static getTotalSize(event: EnhancedWebhookEvent): number {
		return event.attachments?.totalSize || 0;
	}

	/**
	 * Get unique file types without iteration
	 * Deduplicated types from metadata
	 */
	static getFileTypes(event: EnhancedWebhookEvent): string[] {
		return event.attachments?.types || [];
	}

	/**
	 * Get file names with guaranteed correlation to data.files
	 * names[i] corresponds to data.files[i]
	 */
	static getFileNames(event: EnhancedWebhookEvent): string[] {
		return event.attachments?.names || [];
	}

	/**
	 * Validate metadata consistency (trust but verify)
	 * Ensures webhook metadata matches actual file data
	 */
	static validateConsistency(event: EnhancedWebhookEvent): boolean {
		if (!this.shouldProcessEvent(event)) {
			return false;
		}

		const metadata = event.attachments;
		const files = event.data.files;

		// No files scenario - both should be empty/false
		if (!metadata?.hasFiles && (!files || files.length === 0)) {
			return true;
		}

		// Has files scenario - counts should match
		if (metadata?.hasFiles && files && files.length === metadata.fileCount) {
			return true;
		}

		// Inconsistency detected
		LogEngine.warn('Attachment metadata inconsistency detected', {
			metadataHasFiles: metadata?.hasFiles,
			metadataCount: metadata?.fileCount,
			actualFilesCount: files?.length || 0,
			eventId: event.eventId,
			sourcePlatform: event.sourcePlatform,
			conversationId: event.data.conversationId,
		});

		return false;
	}

	/**
	 * Generate processing decision summary
	 * Central method for determining how to handle attachments
	 */
	static getProcessingDecision(event: EnhancedWebhookEvent, maxSizeBytes: number = DISCORD_ATTACHMENT_CONFIG.maxFileSize): AttachmentProcessingDecision {
		const shouldProcess = this.shouldProcessEvent(event);
		const hasAttachments = this.hasAttachments(event);
		const hasImages = this.hasImageAttachments(event);
		const hasSupportedImages = this.hasSupportedImages(event);
		const hasUnsupported = this.hasUnsupportedAttachments(event);
		const isOversized = this.isOversized(event, maxSizeBytes);
		const summary = this.getAttachmentSummary(event);

		let reason = '';
		if (!shouldProcess) {
			reason = 'Non-dashboard event';
		}
		else if (!hasAttachments) {
			reason = 'No attachments';
		}
		else if (isOversized) {
			reason = 'Files too large';
		}
		else if (hasUnsupported) {
			reason = 'Unsupported file types';
		}
		else if (hasSupportedImages) {
			reason = 'Ready for image processing';
		}
		else {
			reason = 'Unknown state';
		}

		return {
			shouldProcess,
			hasAttachments,
			hasImages,
			hasSupportedImages,
			hasUnsupported,
			isOversized,
			summary,
			reason,
		};
	}

	// ==================== LEGACY DISCORD.JS COLLECTION METHODS ====================
	// Maintained for backward compatibility with existing Discord message processing

	/**
	 * Checks if a Discord message has any image attachments (legacy method)
	 */
	static hasDiscordImageAttachments(attachments: Collection<string, Attachment>): boolean {
		return attachments.some(attachment =>
			attachment.contentType && isSupportedImageType(attachment.contentType),
		);
	}

	/**
	 * Filters attachments to only include supported images
	 */
	static filterSupportedImages(attachments: Collection<string, Attachment>): Collection<string, Attachment> {
		return attachments.filter(attachment => {
			if (!attachment.contentType) {
				LogEngine.debug(`Attachment ${attachment.name} has no content type, skipping`);
				return false;
			}

			const normalized = normalizeContentType(attachment.contentType);
			if (!isSupportedImageType(attachment.contentType)) {
				LogEngine.debug(`Attachment ${attachment.name} has unsupported type ${normalized} (original: ${attachment.contentType}), skipping`);
				return false;
			}

			if (!this.validateFileSize(attachment)) {
				LogEngine.debug(`Attachment ${attachment.name} is too large (${attachment.size} bytes), skipping`);
				return false;
			}

			return true;
		});
	}

	/**
	 * Validates individual file size against limits
	 */
	static validateFileSize(attachment: Attachment): boolean {
		return attachment.size <= DISCORD_ATTACHMENT_CONFIG.maxFileSize;
	}

	/**
	 * Gets total size of all attachments
	 */
	static getTotalAttachmentSize(attachments: Collection<string, Attachment>): number {
		return attachments.reduce((total, attachment) => total + attachment.size, 0);
	}

	/**
	 * Gets array of supported image MIME types
	 */
	static getSupportedImageTypes(): readonly string[] {
		return DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
	}

	/**
	 * Validates a single attachment comprehensively
	 */
	static validateAttachment(attachment: Attachment): AttachmentValidationResult {
		// Check if content type exists
		if (!attachment.contentType) {
			return {
				isValid: false,
				error: 'Attachment has no content type information',
			};
		}

		// Check if file type is supported
		if (!isSupportedImageType(attachment.contentType)) {
			const normalized = normalizeContentType(attachment.contentType);
			LogEngine.debug(`Attachment validation failed: unsupported type ${normalized} (original: ${attachment.contentType})`);
			return {
				isValid: false,
				error: DISCORD_ATTACHMENT_CONFIG.errorMessages.unsupportedFileType,
			};
		}

		// Check file size
		if (!this.validateFileSize(attachment)) {
			return {
				isValid: false,
				error: DISCORD_ATTACHMENT_CONFIG.errorMessages.fileTooLarge,
			};
		}

		// All validations passed
		return {
			isValid: true,
			fileInfo: {
				fileName: attachment.name,
				mimeType: attachment.contentType,
				size: attachment.size,
			},
		};
	}

	/**
	 * Validates collection of attachments
	 */
	static validateAttachments(attachments: Collection<string, Attachment>): {
		valid: Attachment[];
		invalid: Array<{ attachment: Attachment; error: string }>;
		totalSize: number;
	} {
		const valid: Attachment[] = [];
		const invalid: Array<{ attachment: Attachment; error: string }> = [];
		let totalSize = 0;

		// Check total count first
		if (attachments.size > DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage) {
			// Mark all as invalid if too many files
			attachments.forEach(attachment => {
				invalid.push({
					attachment,
					error: DISCORD_ATTACHMENT_CONFIG.errorMessages.tooManyFiles,
				});
			});

			return { valid, invalid, totalSize: 0 };
		}

		// Validate each attachment individually
		attachments.forEach(attachment => {
			const validation = this.validateAttachment(attachment);

			if (validation.isValid && validation.fileInfo) {
				valid.push(attachment);
				totalSize += attachment.size;
			}
			else {
				invalid.push({
					attachment,
					error: validation.error || 'Unknown validation error',
				});
			}
		});

		return { valid, invalid, totalSize };
	}
}