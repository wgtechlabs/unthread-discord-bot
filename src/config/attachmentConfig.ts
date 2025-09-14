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
	supportedImageTypes: [
		'image/png',
		'image/jpeg',
		'image/jpg',
		'image/gif',
		'image/webp',
	] as const,

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
	},

	/** Success messages */
	successMessages: {
		uploadComplete: '📎 Image(s) uploaded successfully to your support ticket!',
		partialSuccess: '📎 {count} of {total} images uploaded successfully.',
	},
} as const;

/**
 * Type for supported image MIME types
 */
export type SupportedImageType = typeof DISCORD_ATTACHMENT_CONFIG.supportedImageTypes[number];

/**
 * Gets file extension from MIME type
 */
export function getFileExtensionFromMimeType(mimeType: string): string {
	const mimeToExt: Record<string, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/jpg': 'jpg',
		'image/gif': 'gif',
		'image/webp': 'webp',
	};

	return mimeToExt[mimeType] || 'bin';
}

/**
 * Validates if MIME type is supported
 */
export function isSupportedImageType(mimeType: string): mimeType is SupportedImageType {
	return DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.includes(mimeType as SupportedImageType);
}