/**
 * Discord Attachment Configuration - File Processing Settings
 *
 * @description
 * Centralized configuration for Discord attachment processing including file size
 * limits, supported formats, retry logic, and user-facing error messages.
 * Based on Discord platform limitations and optimal user experience practices.
 *
 * @module config/attachmentConfig
 * @since 1.0.0
 *
 * @keyFunctions
 * - DISCORD_ATTACHMENT_CONFIG: Main configuration object with all attachment settings
 * - isSupportedImageType(): Validates image MIME types against supported formats
 * - normalizeContentType(): Standardizes content-type headers for consistent processing
 *
 * @commonIssues
 * - File size limit exceeded: Users try to upload files larger than 8MB Discord limit
 * - Unsupported formats: Users upload non-image files or unsupported image types
 * - Upload timeouts: Large files or slow connections cause timeout failures
 * - Retry exhaustion: Multiple failed upload attempts due to network issues
 * - Content-type mismatches: Servers return inconsistent MIME type headers
 *
 * @troubleshooting
 * - Monitor file sizes against maxFileSize limit (8MB for Discord free tier)
 * - Check supportedImageTypes array for format compatibility
 * - Adjust uploadTimeout for users with slower connections
 * - Review retry configuration for appropriate attempt limits and delays
 * - Validate content-type normalization for edge cases
 * - Use error messages for clear user guidance on resolution steps
 *
 * @performance
 * - File size validation prevents unnecessary processing of oversized files
 * - Supported format checking optimized with const assertion
 * - Retry logic uses exponential backoff to avoid overwhelming services
 * - Upload timeout prevents hanging operations
 *
 * @dependencies None (pure configuration constants)
 *
 * @example Basic Usage
 * ```typescript
 * const config = DISCORD_ATTACHMENT_CONFIG;
 * if (fileSize > config.maxFileSize) {
 *   throw new Error(config.errorMessages.fileTooLarge);
 * }
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Upload with retry logic
 * for (let attempt = 1; attempt <= config.retry.maxAttempts; attempt++) {
 *   try {
 *     await uploadFile(file);
 *     break;
 *   } catch (error) {
 *     if (attempt === config.retry.maxAttempts) throw error;
 *     await delay(config.retry.baseDelay * attempt);
 *   }
 * }
 * ```
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
export type SupportedImageType = typeof DISCORD_ATTACHMENT_CONFIG.supportedImageTypes[number];

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