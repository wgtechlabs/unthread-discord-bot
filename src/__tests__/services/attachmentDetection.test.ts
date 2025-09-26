/**
 * @fileoverview Tests for AttachmentDetectionService
 * 
 * Comprehensive test suite for the attachment detection service that validates
 * metadata-driven processing decisions, file type validation, and Discord-specific
 * attachment handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentDetectionService, AttachmentProcessingDecision } from '../../services/attachmentDetection';
import { Collection, Attachment } from 'discord.js';
import { EnhancedWebhookEvent } from '../../types/unthread';
import { DISCORD_ATTACHMENT_CONFIG } from '../../config/attachmentConfig';

// Create mock attachment
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'attachment123',
  filename: 'test.png',
  size: 1024,
  url: 'https://cdn.discordapp.com/attachments/test.png',
  proxyURL: 'https://media.discordapp.net/attachments/test.png',
  height: 100,
  width: 100,
  contentType: 'image/png',
  description: null,
  ephemeral: false,
  duration: null,
  waveform: null,
  flags: null,
  ...overrides,
} as Attachment);

// Create mock enhanced webhook event
const createMockWebhookEvent = (overrides: Partial<EnhancedWebhookEvent> = {}): EnhancedWebhookEvent => ({
  id: 'event123',
  type: 'message',
  data: {
    message: {
      id: 'msg123',
      content: 'Test message',
      attachments: [],
    },
    attachments: [],
  },
  metadata: {
    hasAttachments: false,
    hasImages: false,
    hasSupportedImages: false,
    hasUnsupported: false,
    isOversized: false,
    totalSize: 0,
    summary: 'No attachments',
  },
  ...overrides,
} as EnhancedWebhookEvent);

describe('AttachmentDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldProcessEvent', () => {
    it('should return true for events without attachments', () => {
      const event = createMockWebhookEvent();
      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(true);
    });

    it('should return true for events with supported images', () => {
      const event = createMockWebhookEvent({
        metadata: {
          hasAttachments: true,
          hasImages: true,
          hasSupportedImages: true,
          hasUnsupported: false,
          isOversized: false,
          totalSize: 1024,
          summary: '1 supported image',
        },
      });
      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(true);
    });

    it('should return false for events with oversized attachments', () => {
      const event = createMockWebhookEvent({
        metadata: {
          hasAttachments: true,
          hasImages: true,
          hasSupportedImages: false,
          hasUnsupported: false,
          isOversized: true,
          totalSize: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
          summary: 'Oversized attachments',
        },
      });
      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(false);
    });

    it('should return false for events with only unsupported attachments', () => {
      const event = createMockWebhookEvent({
        metadata: {
          hasAttachments: true,
          hasImages: false,
          hasSupportedImages: false,
          hasUnsupported: true,
          isOversized: false,
          totalSize: 1024,
          summary: 'Unsupported files',
        },
      });
      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(false);
    });
  });

  describe('makeProcessingDecision', () => {
    it('should handle empty collection', () => {
      const attachments = new Collection<string, Attachment>();
      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: true,
        hasAttachments: false,
        hasImages: false,
        hasSupportedImages: false,
        hasUnsupported: false,
        isOversized: false,
        summary: 'No attachments',
        reason: 'No attachments to process',
      });
    });

    it('should detect supported images', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'image/png',
        size: 1024,
      });
      attachments.set('1', attachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: true,
        hasAttachments: true,
        hasImages: true,
        hasSupportedImages: true,
        hasUnsupported: false,
        isOversized: false,
        summary: '1 supported image (1.0 KB)',
        reason: 'Has supported images',
      });
    });

    it('should detect oversized attachments', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'image/png',
        size: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
      });
      attachments.set('1', attachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: false,
        hasAttachments: true,
        hasImages: true,
        hasSupportedImages: false,
        hasUnsupported: false,
        isOversized: true,
        reason: 'Attachments exceed size limits',
      });
    });

    it('should detect unsupported file types', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'application/pdf',
        filename: 'document.pdf',
        size: 1024,
      });
      attachments.set('1', attachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: false,
        hasAttachments: true,
        hasImages: false,
        hasSupportedImages: false,
        hasUnsupported: true,
        isOversized: false,
        reason: 'Only unsupported file types',
      });
    });

    it('should handle mixed attachment types', () => {
      const attachments = new Collection<string, Attachment>();
      
      // Supported image
      const supportedImage = createMockAttachment({
        id: '1',
        contentType: 'image/png',
        size: 1024,
        filename: 'image.png',
      });
      
      // Unsupported file
      const unsupportedFile = createMockAttachment({
        id: '2',
        contentType: 'application/pdf',
        size: 2048,
        filename: 'document.pdf',
      });

      attachments.set('1', supportedImage);
      attachments.set('2', unsupportedFile);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: true,
        hasAttachments: true,
        hasImages: true,
        hasSupportedImages: true,
        hasUnsupported: true,
        isOversized: false,
        summary: '1 supported image, 1 unsupported file (3.0 KB total)',
        reason: 'Has supported images (ignoring unsupported)',
      });
    });

    it('should handle null content types gracefully', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: null,
        filename: 'unknown_file',
        size: 1024,
      });
      attachments.set('1', attachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision).toMatchObject({
        shouldProcess: false,
        hasAttachments: true,
        hasImages: false,
        hasSupportedImages: false,
        hasUnsupported: true,
        isOversized: false,
        reason: 'Only unsupported file types',
      });
    });

    it('should calculate total size correctly', () => {
      const attachments = new Collection<string, Attachment>();
      
      const attachment1 = createMockAttachment({
        id: '1',
        contentType: 'image/png',
        size: 1024,
      });
      
      const attachment2 = createMockAttachment({
        id: '2',
        contentType: 'image/jpeg',
        size: 2048,
      });

      attachments.set('1', attachment1);
      attachments.set('2', attachment2);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);

      expect(decision.summary).toContain('3.0 KB total');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(AttachmentDetectionService.formatFileSize(512)).toBe('512 B');
    });

    it('should format kilobytes correctly', () => {
      expect(AttachmentDetectionService.formatFileSize(1024)).toBe('1.0 KB');
      expect(AttachmentDetectionService.formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(AttachmentDetectionService.formatFileSize(1048576)).toBe('1.0 MB');
      expect(AttachmentDetectionService.formatFileSize(1572864)).toBe('1.5 MB');
    });

    it('should handle zero size', () => {
      expect(AttachmentDetectionService.formatFileSize(0)).toBe('0 B');
    });

    it('should handle large files', () => {
      expect(AttachmentDetectionService.formatFileSize(25 * 1024 * 1024)).toBe('25.0 MB');
    });
  });

  describe('validateAttachments', () => {
    it('should validate attachments within size limits', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'image/png',
        size: 1024,
      });
      attachments.set('1', attachment);

      const result = AttachmentDetectionService.validateAttachments(attachments);

      expect(result).toMatchObject({
        valid: true,
        totalSize: 1024,
        supportedCount: 1,
        unsupportedCount: 0,
        oversizedCount: 0,
        errors: [],
      });
    });

    it('should detect oversized individual files', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'image/png',
        size: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
        filename: 'large_image.png',
      });
      attachments.set('1', attachment);

      const result = AttachmentDetectionService.validateAttachments(attachments);

      expect(result).toMatchObject({
        valid: false,
        totalSize: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
        supportedCount: 0,
        unsupportedCount: 0,
        oversizedCount: 1,
      });
      expect(result.errors).toContain('File "large_image.png" exceeds maximum size limit');
    });

    it('should detect unsupported file types', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'application/pdf',
        filename: 'document.pdf',
        size: 1024,
      });
      attachments.set('1', attachment);

      const result = AttachmentDetectionService.validateAttachments(attachments);

      expect(result).toMatchObject({
        valid: false,
        totalSize: 1024,
        supportedCount: 0,
        unsupportedCount: 1,
        oversizedCount: 0,
      });
      expect(result.errors).toContain('File "document.pdf" has unsupported type: application/pdf');
    });

    it('should handle multiple validation errors', () => {
      const attachments = new Collection<string, Attachment>();
      
      // Oversized file
      const oversizedFile = createMockAttachment({
        id: '1',
        contentType: 'image/png',
        size: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
        filename: 'oversized.png',
      });
      
      // Unsupported file
      const unsupportedFile = createMockAttachment({
        id: '2',
        contentType: 'application/pdf',
        filename: 'document.pdf',
        size: 1024,
      });

      attachments.set('1', oversizedFile);
      attachments.set('2', unsupportedFile);

      const result = AttachmentDetectionService.validateAttachments(attachments);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.oversizedCount).toBe(1);
      expect(result.unsupportedCount).toBe(1);
    });
  });

  describe('isImageAttachment', () => {
    it('should identify image attachments correctly', () => {
      const imageAttachment = createMockAttachment({
        contentType: 'image/png',
      });

      expect(AttachmentDetectionService.isImageAttachment(imageAttachment)).toBe(true);
    });

    it('should reject non-image attachments', () => {
      const textAttachment = createMockAttachment({
        contentType: 'text/plain',
      });

      expect(AttachmentDetectionService.isImageAttachment(textAttachment)).toBe(false);
    });

    it('should handle null content type', () => {
      const unknownAttachment = createMockAttachment({
        contentType: null,
      });

      expect(AttachmentDetectionService.isImageAttachment(unknownAttachment)).toBe(false);
    });

    it('should handle various image types', () => {
      const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      
      imageTypes.forEach(type => {
        const attachment = createMockAttachment({ contentType: type });
        expect(AttachmentDetectionService.isImageAttachment(attachment)).toBe(true);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty attachment data gracefully', () => {
      const attachments = new Collection<string, Attachment>();
      const emptyAttachment = createMockAttachment({
        filename: '',
        size: 0,
        contentType: null,
      });
      attachments.set('1', emptyAttachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);
      expect(decision.shouldProcess).toBe(false);
      expect(decision.hasUnsupported).toBe(true);
    });

    it('should handle extremely large collections', () => {
      const attachments = new Collection<string, Attachment>();
      
      // Add many attachments
      for (let i = 0; i < 10; i++) {
        const attachment = createMockAttachment({
          id: `attachment_${i}`,
          contentType: 'image/png',
          size: 1024,
          filename: `image_${i}.png`,
        });
        attachments.set(attachment.id, attachment);
      }

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);
      expect(decision.shouldProcess).toBe(true);
      expect(decision.summary).toContain('10 supported images');
    });

    it('should handle case-insensitive content types', () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        contentType: 'IMAGE/PNG',
      });
      attachments.set('1', attachment);

      const decision = AttachmentDetectionService.makeProcessingDecision(attachments);
      expect(decision.hasSupportedImages).toBe(true);
    });
  });
});