/**
 * Attachment Detection Service
 *
 * Provides validation and filtering services for Discord attachments.
 * Ensures only supported image types within size limits are processed.
 *
 * @module services/attachmentDetection
 */

import { Collection, Attachment } from 'discord.js';
import { DISCORD_ATTACHMENT_CONFIG, isSupportedImageType } from '../config/attachmentConfig';
import { AttachmentValidationResult } from '../types/attachments';
import { LogEngine } from '../config/logger';

export class AttachmentDetectionService {
	/**
	 * Checks if a message has any image attachments
	 */
	static hasImageAttachments(attachments: Collection<string, Attachment>): boolean {
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

			if (!isSupportedImageType(attachment.contentType)) {
				LogEngine.debug(`Attachment ${attachment.name} has unsupported type ${attachment.contentType}, skipping`);
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