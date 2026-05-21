/**
 * Discord Attachment Configuration
 *
 * Configuration constants for Discord attachment processing and validation.
 * Based on Discord free tier limits and supported image formats.
 *
 * @module config/attachmentConfig
 */

/**
 * Discord attachment processing configuration
 */
export const DISCORD_ATTACHMENT_CONFIG = {
	/** Maximum file size per attachment (8MB - Discord free tier limit) */
	maxFileSize: 8 * 1024 * 1024,

	/** Maximum number of files per message */
	maxFilesPerMessage: 10,

	/** Supported image MIME types */
	supportedImageTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'] as const,

	/** Upload timeout in milliseconds */
	uploadTimeout: 30000,

	/** Retry configuration for failed uploads */
	retry: {
		maxAttempts: 3,
		baseDelay: 1000,
		maxDelay: 5000,
	},

	/** Error messages for user feedback */
	errorMessages: {
		unsupportedFileType: '⚠️ Only images (PNG, JPEG, GIF, WebP) are supported.',
		fileTooLarge: '📏 File too large. Maximum size is 8MB per image.',
		tooManyFiles: '📎 Too many files. Maximum is 10 images per message.',
		uploadFailed: '🔄 Upload failed, retrying... (attempt {attempt}/3)',
		uploadError: '❌ Failed to upload attachments. Please try again.',
		downloadFailed: '⬇️ Failed to download attachment from Discord.',
		timeout: '⏱️ Upload timed out. Please try again with smaller files.',
		// Unthread → Discord specific error messages
		unthreadDownloadFailed: '⬇️ Failed to download attachment from Unthread.',
		unthreadAuthError: '🔑 Authentication failed when downloading from Unthread.',
		discordUploadFailed: '📤 Failed to upload attachment to Discord.',
		attachmentProcessingFailed: '🔄 Attachment processing failed, please try again.',
	},

	/** Success messages */
	successMessages: {
		uploadComplete: '📎 Image(s) uploaded successfully to your support ticket!',
		partialSuccess: '📎 {count} of {total} images uploaded successfully.',
		// Unthread → Discord specific success messages
		unthreadDownloadComplete: '📎 File(s) downloaded successfully from Unthread!',
		discordUploadComplete: '📤 File(s) uploaded successfully to Discord!',
	},
} as const;

/**
 * Type for supported image MIME types
 */
export type SupportedImageType = (typeof DISCORD_ATTACHMENT_CONFIG.supportedImageTypes)[number];

/**
 * Gets file extension from MIME type
 */
export function getFileExtensionFromMimeType(mimeType: string): string {
	switch (mimeType) {
		case 'image/png':
			return 'png';
		case 'image/jpeg':
		case 'image/jpg':
			return 'jpg';
		case 'image/gif':
			return 'gif';
		case 'image/webp':
			return 'webp';
		default:
			return 'bin';
	}
}

/**
 * Normalizes MIME type by extracting base type and converting to lowercase
 * Handles cases like "IMAGE/PNG; charset=utf-8" -> "image/png"
 */
export function normalizeContentType(contentType: string): string {
	return contentType.split(';')[0].trim().toLowerCase();
}

/**
 * Validates if MIME type is supported
 */
export function isSupportedImageType(mimeType: string): mimeType is SupportedImageType {
	const normalized = normalizeContentType(mimeType);
	return DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.includes(normalized as SupportedImageType);
}
