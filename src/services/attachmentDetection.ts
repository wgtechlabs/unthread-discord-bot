/**
 * Attachment Detection Service
 *
 * Enhanced metadata-driven attachment detection using proven patterns from the Unthread Telegram bot.
 * Replaces Discord.js Collection-based logic with webhook metadata processing for improved reliability.
 *
 * Key Features:
 * - Metadata-first approach for instant decisions without file iteration
 * - Processing decision pipeline: oversized → unsupported → supported images
 * - File size validation using pre-calculated metadata
 * - Trust-but-verify consistency validation
 * - Discord-specific adaptations for channel routing and message formatting
 *
 * @module services/attachmentDetection
 */

import type { Attachment, Collection } from 'discord.js';
import {
	DISCORD_ATTACHMENT_CONFIG,
	isSupportedImageType,
	normalizeContentType,
} from '../config/attachmentConfig';
import { LogEngine } from '../config/logger';
import type { AttachmentValidationResult } from '../types/attachments';
import type { EnhancedWebhookEvent, WebhookAttachments, WebhookFileData } from '../types/unthread';

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
	private constructor() {}

	/**
	 * Converts extension-only strings to full MIME types.
	 * Handles cases where Unthread sends "png" instead of "image/png".
	 * Matches the Telegram bot's normalizeType() implementation.
	 */
	static normalizeType(rawType: string): string {
		const extensionMap: Record<string, string> = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			webp: 'image/webp',
		};
		return extensionMap[rawType.toLowerCase()] ?? rawType;
	}

	/**
	 * Primary event validation - process dashboard → discord events
	 * Based on Telegram bot's shouldProcessEvent pattern
	 */
	static shouldProcessEvent(event: EnhancedWebhookEvent): boolean {
		return event.sourcePlatform === 'dashboard' && event.targetPlatform === 'discord';
	}

	private static getMetadataAttachmentRecords(
		event: EnhancedWebhookEvent,
	): Array<Record<string, unknown>> {
		const metadata = event.data.metadata as
			| {
					event_payload?: {
						attachments?: Array<Record<string, unknown>>;
					};
			  }
			| undefined;

		return Array.isArray(metadata?.event_payload?.attachments)
			? metadata.event_payload.attachments
			: [];
	}

	/**
	 * Returns a normalized files list for processing.
	 * Falls back to metadata.event_payload.attachments when event.data.files is unavailable.
	 */
	static getProcessableFiles(event: EnhancedWebhookEvent): WebhookFileData[] {
		if (!AttachmentDetectionService.shouldProcessEvent(event)) {
			return [];
		}

		if (Array.isArray(event.data.files) && event.data.files.length > 0) {
			return event.data.files;
		}

		const metadataAttachments = AttachmentDetectionService.getMetadataAttachmentRecords(event);
		if (metadataAttachments.length === 0) {
			return [];
		}

		return metadataAttachments
			.filter((record) => typeof record.id === 'string' && record.id.trim().length > 0)
			.map((record) => {
				const rawType = typeof record.type === 'string' ? record.type : '';
				const normalizedType = rawType
					? AttachmentDetectionService.normalizeType(rawType)
					: 'application/octet-stream';
				const rawSize = record.size;
				const parsedSize =
					typeof rawSize === 'number' ? rawSize : Number.parseInt(String(rawSize ?? '0'), 10);

				return {
					id: String(record.id),
					name:
						typeof record.name === 'string' && record.name.trim().length > 0
							? record.name
							: String(record.id),
					size: Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 0,
					mimetype: normalizedType,
				} as WebhookFileData;
			});
	}

	/**
	 * Returns resolved attachment metadata, with fallback generation from processable files.
	 */
	static getResolvedAttachments(event: EnhancedWebhookEvent): WebhookAttachments | null {
		if (!AttachmentDetectionService.shouldProcessEvent(event)) {
			return null;
		}

		if (event.attachments?.hasFiles === true) {
			return event.attachments;
		}

		const files = AttachmentDetectionService.getProcessableFiles(event);
		if (files.length === 0) {
			return null;
		}

		return {
			hasFiles: true,
			fileCount: files.length,
			totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
			types: Array.from(
				new Set(
					files.map((file) =>
						AttachmentDetectionService.normalizeType(file.mimetype || 'application/octet-stream'),
					),
				),
			),
			names: files.map((file) => file.name || file.id || 'unnamed-file'),
		};
	}

	/**
	 * Primary attachment detection using webhook metadata
	 * Replaces complex array checking and location detection
	 */
	static hasAttachments(event: EnhancedWebhookEvent): boolean {
		return AttachmentDetectionService.getResolvedAttachments(event)?.hasFiles === true;
	}

	/**
	 * Image-specific detection for enhanced attachment processing
	 * Uses metadata types array for instant categorization
	 */
	static hasImageAttachments(event: EnhancedWebhookEvent): boolean {
		const resolved = AttachmentDetectionService.getResolvedAttachments(event);
		if (resolved?.hasFiles !== true) {
			return false;
		}

		return resolved.types.some((type) =>
			AttachmentDetectionService.normalizeType(type).startsWith('image/'),
		);
	}

	/**
	 * Supported image type validation with configuration
	 * Only processes image types we can handle reliably
	 */
	static hasSupportedImages(event: EnhancedWebhookEvent): boolean {
		const resolved = AttachmentDetectionService.getResolvedAttachments(event);
		if (resolved?.hasFiles !== true) {
			return false;
		}

		return resolved.types.some((type) =>
			isSupportedImageType(AttachmentDetectionService.normalizeType(type).toLowerCase()),
		);
	}

	/**
	 * Check for unsupported file types (non-images or unsupported images)
	 * Enables clear user communication about what we can't process yet
	 */
	static hasUnsupportedAttachments(event: EnhancedWebhookEvent): boolean {
		if (!AttachmentDetectionService.hasAttachments(event)) {
			return false;
		}

		// If we have attachments but no supported images, they're unsupported
		return !AttachmentDetectionService.hasSupportedImages(event);
	}

	/**
	 * Size validation using individual file size checks
	 * Discord's 8MB limit applies per file, not total size
	 */
	static isWithinSizeLimit(event: EnhancedWebhookEvent, maxSizeBytes: number): boolean {
		if (!AttachmentDetectionService.hasAttachments(event)) {
			return true;
		}
		const files = AttachmentDetectionService.getProcessableFiles(event);
		if (files.length === 0) return true;
		return files.every((f) => f.size <= maxSizeBytes);
	}

	/**
	 * Check if any individual file exceeds size limits
	 * Enables specific messaging for oversized files
	 */
	static isOversized(event: EnhancedWebhookEvent, maxSizeBytes: number): boolean {
		if (!AttachmentDetectionService.hasAttachments(event)) {
			return false;
		}
		const files = AttachmentDetectionService.getProcessableFiles(event);
		if (files.length === 0) return false;
		return files.some((f) => f.size > maxSizeBytes);
	}

	/**
	 * Get attachment summary for logging/UI
	 * Ready-to-use summary without manual calculation
	 */
	static getAttachmentSummary(event: EnhancedWebhookEvent): string {
		const attachments = AttachmentDetectionService.getResolvedAttachments(event);
		if (!attachments) {
			return 'No attachments';
		}

		const { fileCount, totalSize, types } = attachments;
		const sizeMB = Math.round((totalSize / 1024 / 1024) * 100) / 100;
		const typeList = types.join(', ');

		return `${fileCount} files (${sizeMB}MB) - ${typeList}`;
	}

	/**
	 * Get file count without array access
	 * Instant count from metadata
	 */
	static getFileCount(event: EnhancedWebhookEvent): number {
		return AttachmentDetectionService.getResolvedAttachments(event)?.fileCount || 0;
	}

	/**
	 * Get total size without calculation
	 * Pre-calculated size from metadata
	 */
	static getTotalSize(event: EnhancedWebhookEvent): number {
		return AttachmentDetectionService.getResolvedAttachments(event)?.totalSize || 0;
	}

	/**
	 * Get unique file types without iteration
	 * Deduplicated types from metadata
	 */
	static getFileTypes(event: EnhancedWebhookEvent): string[] {
		return AttachmentDetectionService.getResolvedAttachments(event)?.types || [];
	}

	/**
	 * Get file names with guaranteed correlation to data.files
	 * names[i] corresponds to data.files[i]
	 */
	static getFileNames(event: EnhancedWebhookEvent): string[] {
		return AttachmentDetectionService.getResolvedAttachments(event)?.names || [];
	}

	/**
	 * Validate metadata consistency (trust but verify)
	 * Ensures webhook metadata matches actual file data
	 */
	static validateConsistency(event: EnhancedWebhookEvent): boolean {
		if (!AttachmentDetectionService.shouldProcessEvent(event)) {
			return false;
		}

		const metadata = event.attachments;
		const files = AttachmentDetectionService.getProcessableFiles(event);

		// No files scenario - both should be empty/false
		if (!metadata?.hasFiles && files.length === 0) {
			return true;
		}

		// Has files scenario - counts should match
		if (metadata?.hasFiles && files.length === metadata.fileCount) {
			return true;
		}

		// Inconsistency detected
		LogEngine.warn('Attachment metadata inconsistency detected', {
			metadataHasFiles: metadata?.hasFiles,
			metadataCount: metadata?.fileCount,
			actualFilesCount: files.length,
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
	static getProcessingDecision(
		event: EnhancedWebhookEvent,
		maxSizeBytes: number = DISCORD_ATTACHMENT_CONFIG.maxFileSize,
	): AttachmentProcessingDecision {
		const shouldProcess = AttachmentDetectionService.shouldProcessEvent(event);
		const hasAttachments = AttachmentDetectionService.hasAttachments(event);
		const hasImages = AttachmentDetectionService.hasImageAttachments(event);
		const hasSupportedImages = AttachmentDetectionService.hasSupportedImages(event);
		const hasUnsupported = AttachmentDetectionService.hasUnsupportedAttachments(event);
		const isOversized = AttachmentDetectionService.isOversized(event, maxSizeBytes);
		const summary = AttachmentDetectionService.getAttachmentSummary(event);

		let reason = '';
		if (!shouldProcess) {
			reason = 'Non-dashboard event';
		} else if (!hasAttachments) {
			reason = 'No attachments';
		} else if (isOversized) {
			reason = 'Files too large';
		} else if (hasUnsupported) {
			reason = 'Unsupported file types';
		} else if (hasSupportedImages) {
			reason = 'Ready for image processing';
		} else {
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
		return attachments.some(
			(attachment) => attachment.contentType && isSupportedImageType(attachment.contentType),
		);
	}

	/**
	 * Filters attachments to only include supported images
	 */
	static filterSupportedImages(
		attachments: Collection<string, Attachment>,
	): Collection<string, Attachment> {
		return attachments.filter((attachment) => {
			if (!attachment.contentType) {
				LogEngine.debug(`Attachment ${attachment.name} has no content type, skipping`);
				return false;
			}

			const normalized = normalizeContentType(attachment.contentType);
			if (!isSupportedImageType(attachment.contentType)) {
				LogEngine.debug(
					`Attachment ${attachment.name} has unsupported type ${normalized} (original: ${attachment.contentType}), skipping`,
				);
				return false;
			}

			if (!AttachmentDetectionService.validateFileSize(attachment)) {
				LogEngine.debug(
					`Attachment ${attachment.name} is too large (${attachment.size} bytes), skipping`,
				);
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
			LogEngine.debug(
				`Attachment validation failed: unsupported type ${normalized} (original: ${attachment.contentType})`,
			);
			return {
				isValid: false,
				error: DISCORD_ATTACHMENT_CONFIG.errorMessages.unsupportedFileType,
			};
		}

		// Check file size
		if (!AttachmentDetectionService.validateFileSize(attachment)) {
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
			for (const attachment of attachments.values()) {
				invalid.push({
					attachment,
					error: DISCORD_ATTACHMENT_CONFIG.errorMessages.tooManyFiles,
				});
			}

			return { valid, invalid, totalSize: 0 };
		}

		// Validate each attachment individually
		for (const attachment of attachments.values()) {
			const validation = AttachmentDetectionService.validateAttachment(attachment);

			if (validation.isValid && validation.fileInfo) {
				valid.push(attachment);
				totalSize += attachment.size;
			} else {
				invalid.push({
					attachment,
					error: validation.error || 'Unknown validation error',
				});
			}
		}

		return { valid, invalid, totalSize };
	}
}
