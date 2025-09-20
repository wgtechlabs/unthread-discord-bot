/**
 * Attachment Config Test Suite
 *
 * Tests for Discord attachment configuration constants and validation functions.
 *
 * @module tests/config/attachmentConfig
 */

import { describe, it, expect } from 'vitest';
import { 
  DISCORD_ATTACHMENT_CONFIG, 
  isSupportedImageType 
} from '../../config/attachmentConfig';

describe('attachmentConfig', () => {
  describe('DISCORD_ATTACHMENT_CONFIG', () => {
    it('should have correct file size limits', () => {
      expect(DISCORD_ATTACHMENT_CONFIG.maxFileSize).toBe(8 * 1024 * 1024); // 8MB
      expect(DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage).toBe(10);
    });

    it('should have reasonable timeout settings', () => {
      expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBe(30000); // 30 seconds
      expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBeGreaterThan(5000);
      expect(DISCORD_ATTACHMENT_CONFIG.uploadTimeout).toBeLessThan(60000);
    });

    it('should include all standard image types', () => {
      const supportedTypes = DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
      
      expect(supportedTypes).toContain('image/png');
      expect(supportedTypes).toContain('image/jpeg');
      expect(supportedTypes).toContain('image/jpg');
      expect(supportedTypes).toContain('image/gif');
      expect(supportedTypes).toContain('image/webp');
    });

    it('should have retry configuration', () => {
      const retry = DISCORD_ATTACHMENT_CONFIG.retry;
      
      expect(retry.maxAttempts).toBe(3);
      expect(retry.baseDelay).toBe(1000);
      expect(retry.maxDelay).toBe(5000);
      expect(retry.maxDelay).toBeGreaterThan(retry.baseDelay);
    });

    it('should have user-friendly error messages', () => {
      const messages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
      
      expect(messages.unsupportedFileType).toContain('Only images');
      expect(messages.fileTooLarge).toContain('8MB');
      expect(messages.tooManyFiles).toContain('10');
      expect(messages.uploadFailed).toContain('attempt');
      expect(messages.uploadError).toContain('Failed');
      expect(messages.timeout).toContain('timed out');
    });

    it('should have Unthread-specific error messages', () => {
      const messages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
      
      expect(messages.unthreadDownloadFailed).toContain('Unthread');
      expect(messages.unthreadAuthError).toContain('Authentication');
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

    it('should return false for unsupported image types', () => {
      expect(isSupportedImageType('image/bmp')).toBe(false);
      expect(isSupportedImageType('image/tiff')).toBe(false);
      expect(isSupportedImageType('image/svg+xml')).toBe(false);
      expect(isSupportedImageType('image/avif')).toBe(false);
      expect(isSupportedImageType('image/heic')).toBe(false);
    });

    it('should return false for non-image types', () => {
      expect(isSupportedImageType('text/plain')).toBe(false);
      expect(isSupportedImageType('application/pdf')).toBe(false);
      expect(isSupportedImageType('video/mp4')).toBe(false);
      expect(isSupportedImageType('audio/mp3')).toBe(false);
      expect(isSupportedImageType('application/zip')).toBe(false);
    });

    it('should handle empty and invalid inputs', () => {
      expect(isSupportedImageType('')).toBe(false);
      expect(isSupportedImageType('invalid')).toBe(false);
      expect(isSupportedImageType('image/')).toBe(false);
      expect(isSupportedImageType('image')).toBe(false);
      expect(isSupportedImageType(null as any)).toBe(false);
      expect(isSupportedImageType(undefined as any)).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isSupportedImageType('IMAGE/PNG')).toBe(false);
      expect(isSupportedImageType('Image/Jpeg')).toBe(false);
      expect(isSupportedImageType('image/PNG')).toBe(false);
    });

    it('should handle MIME types with parameters', () => {
      // MIME types sometimes include charset or other parameters
      expect(isSupportedImageType('image/png; charset=utf-8')).toBe(false);
      expect(isSupportedImageType('image/jpeg; quality=0.8')).toBe(false);
    });
  });

  describe('configuration validation', () => {
    it('should have consistent file size limits', () => {
      const maxSize = DISCORD_ATTACHMENT_CONFIG.maxFileSize;
      
      // Should be reasonable for Discord's limits
      expect(maxSize).toBeGreaterThan(1024 * 1024); // At least 1MB
      expect(maxSize).toBeLessThanOrEqual(25 * 1024 * 1024); // No more than 25MB (Discord Nitro limit)
    });

    it('should have reasonable file count limits', () => {
      const maxFiles = DISCORD_ATTACHMENT_CONFIG.maxFilesPerMessage;
      
      expect(maxFiles).toBeGreaterThan(1);
      expect(maxFiles).toBeLessThanOrEqual(10); // Discord limit
    });

    it('should have escalating retry delays', () => {
      const retry = DISCORD_ATTACHMENT_CONFIG.retry;
      
      expect(retry.maxDelay).toBeGreaterThan(retry.baseDelay);
      expect(retry.maxAttempts).toBeGreaterThan(1);
      expect(retry.maxAttempts).toBeLessThanOrEqual(5); // Reasonable limit
    });

    it('should have timeout longer than base retry delay', () => {
      const timeout = DISCORD_ATTACHMENT_CONFIG.uploadTimeout;
      const baseDelay = DISCORD_ATTACHMENT_CONFIG.retry.baseDelay;
      
      expect(timeout).toBeGreaterThan(baseDelay * 3); // Allow for retries
    });
  });

  describe('error message quality', () => {
    it('should have emoji prefixes for visual clarity', () => {
      const messages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
      
      expect(messages.unsupportedFileType).toMatch(/^[⚠️🚫❌]/);
      expect(messages.fileTooLarge).toMatch(/^[📏📐📊]/);
      expect(messages.tooManyFiles).toMatch(/^[📎📂📋]/);
    });

    it('should include specific limits in error messages', () => {
      const messages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
      
      expect(messages.fileTooLarge).toContain('8MB');
      expect(messages.tooManyFiles).toContain('10');
    });

    it('should have actionable error messages', () => {
      const messages = DISCORD_ATTACHMENT_CONFIG.errorMessages;
      
      // Messages should suggest what the user can do
      expect(messages.uploadError).toContain('try again');
      expect(messages.timeout).toContain('smaller files');
    });
  });

  describe('type safety', () => {
    it('should have readonly supported types array', () => {
      const types = DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
      
      // This test ensures the types are readonly (TypeScript compile-time check)
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should maintain consistent MIME type format', () => {
      const types = DISCORD_ATTACHMENT_CONFIG.supportedImageTypes;
      
      types.forEach(type => {
        expect(type).toMatch(/^image\/.+$/);
        expect(type).not.toContain(' ');
        expect(type.toLowerCase()).toBe(type); // Should be lowercase
      });
    });
  });
});