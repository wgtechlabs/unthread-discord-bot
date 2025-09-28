/**
 * Test Suite: Discord Attachment Configuration
 *
 * Comprehensive tests for the attachment configuration module.
 * Tests cover configuration constants, utility functions, MIME type validation,
 * and error/success message definitions.
 */

import { describe, it, expect } from 'vitest';
import {
	DISCORD_ATTACHMENT_CONFIG,
	getFileExtensionFromMimeType,
	normalizeContentType,
	isSupportedImageType,
	type SupportedImageType,
} from '@config/attachmentConfig';

describe('attachmentConfig', () => {
	describe('DISCORD_ATTACHMENT_CONFIG', () => {
		describe('Configuration Constants', () => {
			it('should have correct file size limit (8MB Discord free tier)', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBe(8 * 1024 * 1024);
				expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBe(8388608);
			});

			it('should have correct maximum files per message limit', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage).toBe(10);
			});

			it('should have correct upload timeout', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBe(30000);
			});

			it('should have valid retry configuration', () => {
				const retry = DISCORD_ATTACHMENT_CONFIG.retry;
				expect(retry.maxAttempts).toBe(3);
				expect(retry.baseDelay).toBe(1000);
				expect(retry.maxDelay).toBe(5000);
			});
		});

		describe('Supported Image Types', () => {
			it('should include all required image MIME types', () => {
				const expectedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toEqual(expect.arrayContaining(expectedTypes));
			});

			it('should have exactly 5 supported image types', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toHaveLength(5);
			});

			it('should support PNG images', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toContain('image/png');
			});

			it('should support JPEG images (both variants)', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toContain('image/jpeg');
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toContain('image/jpg');
			});

			it('should support GIF images', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toContain('image/gif');
			});

			it('should support WebP images', () => {
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toContain('image/webp');
			});

			it('should be an array', () => {
				expect(Array.isArray(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes)).toBe(true);
			});
		});

		describe('Error Messages', () => {
			it('should have all required error messages', () => {
				const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
				
				expect(errorMessages.unsupportedFileType).toBe('⚠️ Only images (PNG, JPEG, GIF, WebP) are supported.');
				expect(errorMessages.fileTooLarge).toBe('📏 File too large. Maximum size is 8MB per image.');
				expect(errorMessages.tooManyFiles).toBe('📎 Too many files. Maximum is 10 images per message.');
				expect(errorMessages.uploadFailed).toBe('🔄 Upload failed, retrying... (attempt {attempt}/3)');
				expect(errorMessages.uploadError).toBe('❌ Failed to upload attachments. Please try again.');
				expect(errorMessages.downloadFailed).toBe('⬇️ Failed to download attachment from Discord.');
				expect(errorMessages.timeout).toBe('⏱️ Upload timed out. Please try again with smaller files.');
			});

			it('should have Unthread-specific error messages', () => {
				const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
				
				expect(errorMessages.unthreadDownloadFailed).toBe('⬇️ Failed to download attachment from Unthread.');
				expect(errorMessages.unthreadAuthError).toBe('🔑 Authentication failed when downloading from Unthread.');
				expect(errorMessages.discordUploadFailed).toBe('📤 Failed to upload attachment to Discord.');
				expect(errorMessages.attachmentProcessingFailed).toBe('🔄 Attachment processing failed, please try again.');
			});

			it('should include emojis for user-friendly experience', () => {
				const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
				
				// Check that all error messages contain emojis
				Object.values(errorMessages).forEach(message => {
					expect(message).toMatch(/[⚠️📏📎🔄❌⬇️⏱️🔑📤]/);
				});
			});

			it('should have template placeholders where needed', () => {
				const errorMessages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
				
				expect(errorMessages.uploadFailed).toContain('{attempt}');
			});
		});

		describe('Success Messages', () => {
			it('should have all required success messages', () => {
				const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
				
				expect(successMessages.uploadComplete).toBe('📎 Image(s) uploaded successfully to your support ticket!');
				expect(successMessages.partialSuccess).toBe('📎 {count} of {total} images uploaded successfully.');
			});

			it('should have Unthread-specific success messages', () => {
				const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
				
				expect(successMessages.unthreadDownloadComplete).toBe('📎 File(s) downloaded successfully from Unthread!');
				expect(successMessages.discordUploadComplete).toBe('📤 File(s) uploaded successfully to Discord!');
			});

			it('should include template placeholders for dynamic values', () => {
				const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
				
				expect(successMessages.partialSuccess).toContain('{count}');
				expect(successMessages.partialSuccess).toContain('{total}');
			});

			it('should include emojis for positive user feedback', () => {
				const successMessages = DISCORD_ATTACHMENT_CONFIG.successMessages;
				
				// Check that all success messages contain emojis
				Object.values(successMessages).forEach(message => {
					expect(message).toMatch(/[📎📤]/);
				});
			});
		});

		describe('Configuration Structure', () => {
			it('should have expected configuration structure', () => {
				// Test that the configuration has all required properties
				expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.supportedImageTypes).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.retry).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.errorMessages).toBeDefined();
				expect(DISCORD_ATTACHMENT_CONFIG.successMessages).toBeDefined();
			});

			it('should maintain consistent configuration values', () => {
				// Test that values remain consistent
				expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBe(8 * 1024 * 1024);
				expect(DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage).toBe(10);
				expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBe(30000);
			});

			it('should have consistent array structure', () => {
				const supportedTypes = DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
				expect(Array.isArray(supportedTypes)).toBe(true);
				expect(supportedTypes.length).toBeGreaterThan(0);
			});
		});
	});

	describe('getFileExtensionFromMimeType', () => {
		it('should return correct extension for PNG', () => {
			expect(getFileExtensionFromMimeType('image/png')).toBe('png');
		});

		it('should return correct extension for JPEG', () => {
			expect(getFileExtensionFromMimeType('image/jpeg')).toBe('jpg');
		});

		it('should return correct extension for JPG variant', () => {
			expect(getFileExtensionFromMimeType('image/jpg')).toBe('jpg');
		});

		it('should return correct extension for GIF', () => {
			expect(getFileExtensionFromMimeType('image/gif')).toBe('gif');
		});

		it('should return correct extension for WebP', () => {
			expect(getFileExtensionFromMimeType('image/webp')).toBe('webp');
		});

		it('should return "bin" for unsupported MIME types', () => {
			expect(getFileExtensionFromMimeType('application/pdf')).toBe('bin');
			expect(getFileExtensionFromMimeType('text/plain')).toBe('bin');
			expect(getFileExtensionFromMimeType('video/mp4')).toBe('bin');
			expect(getFileExtensionFromMimeType('audio/mp3')).toBe('bin');
			expect(getFileExtensionFromMimeType('image/bmp')).toBe('bin');
		});

		it('should handle empty string', () => {
			expect(getFileExtensionFromMimeType('')).toBe('bin');
		});

		it('should handle case sensitivity', () => {
			expect(getFileExtensionFromMimeType('IMAGE/PNG')).toBe('bin');
			expect(getFileExtensionFromMimeType('Image/Jpeg')).toBe('bin');
		});

		it('should handle invalid MIME types', () => {
			expect(getFileExtensionFromMimeType('not-a-mime-type')).toBe('bin');
			expect(getFileExtensionFromMimeType('image/')).toBe('bin');
			expect(getFileExtensionFromMimeType('/png')).toBe('bin');
		});
	});

	describe('normalizeContentType', () => {
		it('should extract base MIME type from content type with parameters', () => {
			expect(normalizeContentType('image/png; charset=utf-8')).toBe('image/png');
			expect(normalizeContentType('image/jpeg; boundary=something')).toBe('image/jpeg');
			expect(normalizeContentType('text/plain; charset=iso-8859-1')).toBe('text/plain');
		});

		it('should convert to lowercase', () => {
			expect(normalizeContentType('IMAGE/PNG')).toBe('image/png');
			expect(normalizeContentType('Image/Jpeg')).toBe('image/jpeg');
			expect(normalizeContentType('TEXT/PLAIN')).toBe('text/plain');
		});

		it('should trim whitespace', () => {
			expect(normalizeContentType('  image/png  ')).toBe('image/png');
			expect(normalizeContentType('\timage/jpeg\n')).toBe('image/jpeg');
		});

		it('should handle content type without parameters', () => {
			expect(normalizeContentType('image/png')).toBe('image/png');
			expect(normalizeContentType('image/jpeg')).toBe('image/jpeg');
			expect(normalizeContentType('application/pdf')).toBe('application/pdf');
		});

		it('should handle multiple semicolons', () => {
			expect(normalizeContentType('image/png; charset=utf-8; boundary=test')).toBe('image/png');
		});

		it('should handle edge cases', () => {
			expect(normalizeContentType('')).toBe('');
			expect(normalizeContentType(';')).toBe('');
			expect(normalizeContentType('image/png;')).toBe('image/png');
			expect(normalizeContentType('; charset=utf-8')).toBe('');
		});

		it('should handle complex content type scenarios', () => {
			expect(normalizeContentType('image/png; charset="utf-8"; name="file.png"')).toBe('image/png');
			expect(normalizeContentType('IMAGE/JPEG; CHARSET=UTF-8')).toBe('image/jpeg');
		});

		it('should preserve base type structure', () => {
			expect(normalizeContentType('application/vnd.ms-excel')).toBe('application/vnd.ms-excel');
			expect(normalizeContentType('text/x-custom-type')).toBe('text/x-custom-type');
		});
	});

	describe('isSupportedImageType', () => {
		describe('Supported Types', () => {
			it('should accept PNG images', () => {
				expect(isSupportedImageType('image/png')).toBe(true);
			});

			it('should accept JPEG images', () => {
				expect(isSupportedImageType('image/jpeg')).toBe(true);
			});

			it('should accept JPG variant', () => {
				expect(isSupportedImageType('image/jpg')).toBe(true);
			});

			it('should accept GIF images', () => {
				expect(isSupportedImageType('image/gif')).toBe(true);
			});

			it('should accept WebP images', () => {
				expect(isSupportedImageType('image/webp')).toBe(true);
			});
		});

		describe('Content Type Normalization', () => {
			it('should accept supported types with parameters', () => {
				expect(isSupportedImageType('image/png; charset=utf-8')).toBe(true);
				expect(isSupportedImageType('image/jpeg; boundary=test')).toBe(true);
				expect(isSupportedImageType('image/gif; name="animated.gif"')).toBe(true);
			});

			it('should accept supported types with different casing', () => {
				expect(isSupportedImageType('IMAGE/PNG')).toBe(true);
				expect(isSupportedImageType('Image/Jpeg')).toBe(true);
				expect(isSupportedImageType('IMAGE/GIF')).toBe(true);
			});

			it('should accept supported types with whitespace', () => {
				expect(isSupportedImageType('  image/png  ')).toBe(true);
				expect(isSupportedImageType('\timage/jpeg\n')).toBe(true);
			});
		});

		describe('Unsupported Types', () => {
			it('should reject non-image MIME types', () => {
				expect(isSupportedImageType('application/pdf')).toBe(false);
				expect(isSupportedImageType('text/plain')).toBe(false);
				expect(isSupportedImageType('video/mp4')).toBe(false);
				expect(isSupportedImageType('audio/mp3')).toBe(false);
			});

			it('should reject unsupported image types', () => {
				expect(isSupportedImageType('image/bmp')).toBe(false);
				expect(isSupportedImageType('image/tiff')).toBe(false);
				expect(isSupportedImageType('image/svg+xml')).toBe(false);
				expect(isSupportedImageType('image/x-icon')).toBe(false);
			});

			it('should reject invalid MIME types', () => {
				expect(isSupportedImageType('')).toBe(false);
				expect(isSupportedImageType('not-a-mime-type')).toBe(false);
				expect(isSupportedImageType('image/')).toBe(false);
				expect(isSupportedImageType('/png')).toBe(false);
			});
		});

		describe('Type Guard Functionality', () => {
			it('should act as a type guard for TypeScript', () => {
				const mimeType = 'image/png' as string;
				
				if (isSupportedImageType(mimeType)) {
					// TypeScript should now know mimeType is SupportedImageType
					const supportedType: SupportedImageType = mimeType;
					expect(supportedType).toBe('image/png');
				}
			});

			it('should narrow type correctly for all supported types', () => {
				const testTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
				
				testTypes.forEach(type => {
					expect(isSupportedImageType(type)).toBe(true);
				});
			});
		});

		describe('Edge Cases', () => {
			it('should handle malformed content types', () => {
				expect(isSupportedImageType('image/png;;; invalid')).toBe(true); // Normalization should still work
				expect(isSupportedImageType(';;;image/jpeg')).toBe(false); // Leading semicolons
			});

			it('should handle very long content type strings', () => {
				const longContentType = 'image/png; ' + 'x'.repeat(1000) + '=value';
				expect(isSupportedImageType(longContentType)).toBe(true);
			});

			it('should handle special characters in parameters', () => {
				expect(isSupportedImageType('image/png; filename="test@#$%.png"')).toBe(true);
			});
		});
	});

	describe('Integration Tests', () => {
		it('should work together for complete MIME type processing', () => {
			const contentType = 'IMAGE/PNG; charset=utf-8; name="test.png"';
			
			// Should normalize and validate correctly
			expect(isSupportedImageType(contentType)).toBe(true);
			
			// Should get correct extension after normalization
			const normalized = normalizeContentType(contentType);
			expect(getFileExtensionFromMimeType(normalized)).toBe('png');
		});

		it('should handle workflow for unsupported types', () => {
			const contentType = 'APPLICATION/PDF; name="document.pdf"';
			
			// Should reject unsupported type
			expect(isSupportedImageType(contentType)).toBe(false);
			
			// Should return binary extension
			const normalized = normalizeContentType(contentType);
			expect(getFileExtensionFromMimeType(normalized)).toBe('bin');
		});

		it('should validate configuration consistency', () => {
			// All supported types should have proper extensions and be supported
			DISCORD_ATTACHMENT_CONFIG.supportedImageTypes.forEach(mimeType => {
				expect(isSupportedImageType(mimeType)).toBe(true);
				
				// Each supported type should have a proper extension
				const extension = getFileExtensionFromMimeType(mimeType);
				expect(extension).not.toBe('bin');
				expect(['png', 'jpg', 'gif', 'webp']).toContain(extension);
			});
		});

		it('should handle real-world content type examples', () => {
			const realWorldExamples = [
				'image/png',
				'image/jpeg',
				'image/gif',
				'image/webp',
				'image/png; charset=binary',
				'Image/JPEG; boundary=----formdata',
				'  image/gif  ',
			];

			realWorldExamples.forEach(contentType => {
				expect(isSupportedImageType(contentType)).toBe(true);
			});
		});
	});
});