/**
 * Test Suite: Attachment Configuration
 *
 * Comprehensive tests for attachment configuration constants and utility functions.
 * Tests cover file validation, MIME type handling, and configuration values.
 */

import { describe, it, expect } from 'vitest';
import {
	DISCORD_ATTACHMENT_CONFIG,
	SupportedImageType,
	getFileExtensionFromMimeType,
	normalizeContentType,
	isSupportedImageType,
} from '../../config/attachmentConfig';

describe('DISCORD_ATTACHMENT_CONFIG', () => {
	describe('configuration values', () => {
		it('should have correct file size limit', () => {
			expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBe(8 * 1024 * 1024); // 8MB
		});

		it('should have correct max files per message', () => {
			expect(DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage).toBe(10);
		});

		it('should have reasonable upload timeout', () => {
			expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBe(30000); // 30 seconds
		});

		it('should have supported image types array', () => {
			expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toEqual([
				'image/png',
				'image/jpeg',
				'image/jpg',
				'image/gif',
				'image/webp',
			]);
		});

		it('should have retry configuration', () => {
			expect(DISCORD_ATTACHMENT_CONFIG.retry).toEqual({
				maxAttempts: 3,
				baseDelay: 1000,
				maxDelay: 5000,
			});
		});
	});

	describe('error messages', () => {
		it('should have user-friendly error messages', () => {
			const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
			
			expect(errorMessages.unsupportedFileType).toContain('Only images');
			expect(errorMessages.fileTooLarge).toContain('8MB');
			expect(errorMessages.tooManyFiles).toContain('10 images');
			expect(errorMessages.uploadFailed).toContain('attempt');
			expect(errorMessages.uploadError).toContain('Failed to upload');
			expect(errorMessages.downloadFailed).toContain('download');
			expect(errorMessages.timeout).toContain('timed out');
		});

		it('should have unthread-specific error messages', () => {
			const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
			
			expect(errorMessages.unthreadDownloadFailed).toContain('Unthread');
			expect(errorMessages.unthreadAuthError).toContain('Authentication');
			expect(errorMessages.discordUploadFailed).toContain('Discord');
			expect(errorMessages.attachmentProcessingFailed).toContain('processing');
		});
	});

	describe('success messages', () => {
		it('should have positive success messages', () => {
			const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
			
			expect(successMessages.uploadComplete).toContain('successfully');
			expect(successMessages.partialSuccess).toContain('{count}');
			expect(successMessages.partialSuccess).toContain('{total}');
		});

		it('should have unthread-specific success messages', () => {
			const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
			
			expect(successMessages.unthreadDownloadComplete).toContain('Unthread');
			expect(successMessages.discordUploadComplete).toContain('Discord');
		});
	});
});

describe('getFileExtensionFromMimeType', () => {
	it('should return correct extension for supported image types', () => {
		expect(getFileExtensionFromMimeType('image/png')).toBe('png');
		expect(getFileExtensionFromMimeType('image/jpeg')).toBe('jpg');
		expect(getFileExtensionFromMimeType('image/jpg')).toBe('jpg');
		expect(getFileExtensionFromMimeType('image/gif')).toBe('gif');
		expect(getFileExtensionFromMimeType('image/webp')).toBe('webp');
	});

	it('should return "bin" for unsupported types', () => {
		expect(getFileExtensionFromMimeType('text/plain')).toBe('bin');
		expect(getFileExtensionFromMimeType('application/pdf')).toBe('bin');
		expect(getFileExtensionFromMimeType('video/mp4')).toBe('bin');
		expect(getFileExtensionFromMimeType('unknown/type')).toBe('bin');
	});

	it('should handle empty or invalid input', () => {
		expect(getFileExtensionFromMimeType('')).toBe('bin');
		expect(getFileExtensionFromMimeType('invalid')).toBe('bin');
	});

	it('should be case sensitive (as expected)', () => {
		expect(getFileExtensionFromMimeType('IMAGE/PNG')).toBe('bin');
		expect(getFileExtensionFromMimeType('Image/Png')).toBe('bin');
	});
});

describe('normalizeContentType', () => {
	it('should extract base MIME type', () => {
		expect(normalizeContentType('image/png')).toBe('image/png');
		expect(normalizeContentType('image/jpeg; charset=utf-8')).toBe('image/jpeg');
		expect(normalizeContentType('image/gif; boundary=something')).toBe('image/gif');
	});

	it('should convert to lowercase', () => {
		expect(normalizeContentType('IMAGE/PNG')).toBe('image/png');
		expect(normalizeContentType('Image/Jpeg')).toBe('image/jpeg');
		expect(normalizeContentType('IMAGE/GIF; CHARSET=UTF-8')).toBe('image/gif');
	});

	it('should trim whitespace', () => {
		expect(normalizeContentType('  image/png  ')).toBe('image/png');
		expect(normalizeContentType('image/jpeg ; charset=utf-8')).toBe('image/jpeg');
		expect(normalizeContentType(' IMAGE/WEBP ; boundary=test ')).toBe('image/webp');
	});

	it('should handle edge cases', () => {
		expect(normalizeContentType('')).toBe('');
		expect(normalizeContentType('invalid')).toBe('invalid');
		expect(normalizeContentType('text/plain;')).toBe('text/plain');
	});
});

describe('isSupportedImageType', () => {
	it('should return true for supported image types', () => {
		expect(isSupportedImageType('image/png')).toBe(true);
		expect(isSupportedImageType('image/jpeg')).toBe(true);
		expect(isSupportedImageType('image/jpg')).toBe(true);
		expect(isSupportedImageType('image/gif')).toBe(true);
		expect(isSupportedImageType('image/webp')).toBe(true);
	});

	it('should return false for unsupported types', () => {
		expect(isSupportedImageType('text/plain')).toBe(false);
		expect(isSupportedImageType('application/pdf')).toBe(false);
		expect(isSupportedImageType('video/mp4')).toBe(false);
		expect(isSupportedImageType('image/svg+xml')).toBe(false);
		expect(isSupportedImageType('image/bmp')).toBe(false);
	});

	it('should normalize content type before checking', () => {
		expect(isSupportedImageType('IMAGE/PNG')).toBe(true);
		expect(isSupportedImageType('image/JPEG; charset=utf-8')).toBe(true);
		expect(isSupportedImageType('  image/gif  ')).toBe(true);
		expect(isSupportedImageType('Image/WebP; boundary=test')).toBe(true);
	});

	it('should handle edge cases', () => {
		expect(isSupportedImageType('')).toBe(false);
		expect(isSupportedImageType('invalid')).toBe(false);
		expect(isSupportedImageType('image/')).toBe(false);
		expect(isSupportedImageType('image')).toBe(false);
	});

	it('should work as type guard', () => {
		const mimeType: string = 'image/png';
		
		if (isSupportedImageType(mimeType)) {
			// TypeScript should know mimeType is SupportedImageType here
			const supportedType: SupportedImageType = mimeType;
			expect(supportedType).toBe('image/png');
		}
	});
});

describe('configuration consistency', () => {
	it('should have consistent file size limits', () => {
		// 8MB should be a reasonable limit for Discord free tier
		expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBeGreaterThan(1024 * 1024); // At least 1MB
		expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBeLessThanOrEqual(25 * 1024 * 1024); // At most 25MB
	});

	it('should have reasonable retry configuration', () => {
		const retry = DISCORD_ATTACHMENT_CONFIG.retry;
		
		expect(retry.maxAttempts).toBeGreaterThan(1);
		expect(retry.maxAttempts).toBeLessThanOrEqual(5);
		expect(retry.baseDelay).toBeGreaterThan(0);
		expect(retry.maxDelay).toBeGreaterThanOrEqual(retry.baseDelay);
	});

	it('should have reasonable timeout values', () => {
		expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBeGreaterThan(5000); // At least 5 seconds
		expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBeLessThanOrEqual(60000); // At most 1 minute
	});
});

describe('supported image types validation', () => {
	it('should support common web image formats', () => {
		const types = DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
		
		expect(types).toContain('image/png');
		expect(types).toContain('image/jpeg');
		expect(types).toContain('image/gif');
		expect(types).toContain('image/webp');
	});

	it('should have consistent MIME type format', () => {
		DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.forEach(type => {
			expect(type).toMatch(/^image\/[a-z]+$/);
			expect(type).toBe(type.toLowerCase());
		});
	});

	it('should work with getFileExtensionFromMimeType', () => {
		DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.forEach(type => {
			const extension = getFileExtensionFromMimeType(type);
			expect(extension).not.toBe('bin');
			expect(extension.length).toBeGreaterThan(0);
		});
	});
});