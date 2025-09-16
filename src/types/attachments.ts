/**
 * Discord Attachment Types
 *
 * Type definitions for Discord → Unthread attachment processing system.
 * Supports buffer-based image uploads with proper validation and error handling.
 *
 * @module types/attachments
 */

/**
 * Represents a file buffer with metadata for upload processing
 */
export interface FileBuffer {
	/** Raw file data as Buffer */
	buffer: Buffer;
	/** Original filename from Discord */
	fileName: string;
	/** MIME type of the file */
	mimeType: string;
	/** File size in bytes */
	size: number;
}

/**
 * Result of attachment processing operation
 */
export interface AttachmentProcessingResult {
	/** Whether the processing was successful */
	success: boolean;
	/** Number of attachments successfully processed */
	processedCount: number;
	/** Array of error messages for failed attachments */
	errors: string[];
	/** Total processing time in milliseconds */
	processingTime: number;
}

/**
 * Configuration for attachment validation
 */
export interface AttachmentValidationResult {
	/** Whether the attachment is valid */
	isValid: boolean;
	/** Error message if invalid */
	error?: string;
	/** Validated file info if valid */
	fileInfo?: {
		fileName: string;
		mimeType: string;
		size: number;
	};
}

/**
 * Represents an Unthread file attachment for download processing
 */
export interface UnthreadAttachment {
	/** Original filename */
	filename: string;
	/** URL where the file can be accessed */
	url: string;
	/** MIME type of the file */
	content_type: string;
	/** File size in bytes */
	size: number;
}