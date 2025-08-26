/**
 * Discord Attachment Configuration and File Signature Detection
 *
 * This module provides comprehensive file attachment configuration and security
 * validation for the Discord bot. It includes file signature detection, MIME type
 * validation, and processing limits optimized for Discord's capabilities.
 *
 * Features:
 * - Magic number validation for security
 * - Multi-layer MIME type detection
 * - Discord-optimized file limits
 * - Comprehensive security settings
 *
 * @module config/attachments
 */

/**
 * File signature detection using magic numbers for security validation
 * Each supported file type has one or more byte signatures that can be detected
 * at the beginning of file buffers to verify authentic file types.
 */
export const FILE_SIGNATURES = {
	'image/jpeg': [
		[0xFF, 0xD8, 0xFF], // Standard JPEG
		[0xFF, 0xD8, 0xFF, 0xE0], // JPEG with JFIF
		[0xFF, 0xD8, 0xFF, 0xE1], // JPEG with EXIF
	],
	'image/png': [
		[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG signature
	],
	'image/gif': [
		[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
		[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
	],
	'image/webp': [
		[0x52, 0x49, 0x46, 0x46], // RIFF header (WebP container)
	],
} as const;

/**
 * Discord Attachment Configuration
 *
 * Comprehensive configuration for file attachment processing optimized for Discord.
 * These settings balance functionality with security and performance considerations.
 */
export const DISCORD_ATTACHMENT_CONFIG = {
	// File Size and Batch Limits (Discord-optimized)
	maxFileSize: 10 * 1024 * 1024, // 10MB per file (Discord limit)
	maxFiles: 10, // Discord supports multiple attachments
	maxTotalSize: 50 * 1024 * 1024, // 50MB total batch size

	// Supported File Formats (matching Telegram bot exactly)
	supportedFormats: [
		'image/jpeg',
		'image/jpg', // Some systems use this variant
		'image/png',
		'image/gif',
		'image/webp',
	] as const,

	// Network and Timeout Settings
	downloadTimeout: 15000, // 15 seconds for file downloads
	uploadTimeout: 30000, // 30 seconds for Discord uploads
	retryAttempts: 3, // Retry failed operations
	retryBaseDelay: 1000, // Base delay between retries (ms)

	// Performance and Memory Management
	memoryThreshold: 100 * 1024 * 1024, // 100MB memory threshold
	maxConcurrentFiles: 3, // Process max 3 files concurrently
	bufferPoolSize: 5, // Number of buffers to pool

	// Security and Validation Settings
	enableContentValidation: true, // Validate file content beyond MIME type
	sanitizeFileNames: true, // Remove dangerous characters from filenames
	enableClipboardSupport: true, // Enhanced MIME detection for paste operations
	maxFilenameLength: 255, // Maximum filename length

	// File Processing Settings
	enableProgressTracking: true, // Track upload/download progress
	enableMemoryOptimization: true, // Use memory optimization techniques
	enableGarbageCollectionHints: true, // Trigger GC after large operations

	// Discord-specific Settings
	discordMaxMessageLength: 2000, // Discord message character limit
	embedColor: 0x5865F2, // Discord brand color for embeds
	attachmentPrefix: 'discord_attachment_', // Prefix for generated filenames

	// Validation Patterns
	dangerousFilenamePatterns: [
		/\.\./, // Path traversal attempts
		/[<>:"|?*]/, // Windows reserved characters
		/[\x00-\x1f]/, // Control characters
		/^\./, // Hidden files starting with dot
		/\.(exe|bat|cmd|scr|pif|com|vbs|jar|js|wsf|wsh)$/i, // Potentially dangerous extensions
	],

	// Error Messages
	errors: {
		fileTooBig: 'File size exceeds 10MB limit',
		unsupportedFormat: 'File format not supported. Supported: JPEG, PNG, GIF, WebP',
		tooManyFiles: 'Too many files. Maximum 10 files per batch',
		downloadFailed: 'Failed to download file from Unthread',
		uploadFailed: 'Failed to upload file to Discord',
		invalidSignature: 'File signature validation failed - possible security risk',
		dangerousFilename: 'Filename contains dangerous characters',
		memoryLimit: 'Memory usage limit exceeded',
	},
} as const;

/**
 * Type definitions for attachment configuration
 */
export type SupportedMimeType = typeof DISCORD_ATTACHMENT_CONFIG.supportedFormats[number];
export type FileSignatureMap = typeof FILE_SIGNATURES;
export type AttachmentConfig = typeof DISCORD_ATTACHMENT_CONFIG;

/**
 * File buffer interface for attachment processing
 */
export interface FileBuffer {
	buffer: Buffer;
	filename: string;
	mimeType: string;
	size: number;
	originalUrl?: string;
	sanitizedFilename: string;
	isValidSignature: boolean;
}

/**
 * File processing result interface
 */
export interface BufferProcessingResult {
	success: boolean;
	processedCount: number;
	failedCount: number;
	totalSize: number;
	errors: string[];
	files: FileBuffer[];
}

/**
 * File validation result interface
 */
export interface FileValidationResult {
	isValid: boolean;
	mimeType: string;
	sanitizedFilename: string;
	errors: string[];
	size: number;
}

/**
 * Enhanced attachment metadata for webhook events
 */
export interface AttachmentMetadata {
	hasFiles: boolean;
	fileCount: number;
	totalSize: number;
	types: string[];
	supportedCount: number;
	validationErrors: string[];
}