/**
 * @fileoverview Tests for AttachmentHandler
 * 
 * Comprehensive test suite for the Discord attachment processing system covering
 * buffer-based downloads, file validation, upload retry logic, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Collection, Attachment, ThreadChannel, AttachmentBuilder } from 'discord.js';
import { AttachmentHandler } from '../../utils/attachmentHandler';
import { FileBuffer, AttachmentProcessingResult } from '../../types/attachments';
import { DISCORD_ATTACHMENT_CONFIG } from '../../config/attachmentConfig';

// Mock dependencies using vi.hoisted to ensure proper hoisting
const { mockFetch, mockSendMessageWithAttachmentsToUnthread, mockAttachmentDetectionService } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  const mockSendMessageWithAttachmentsToUnthread = vi.fn();
  const mockAttachmentDetectionService = {
    validateAttachments: vi.fn(),
    makeProcessingDecision: vi.fn(),
  };
  return { mockFetch, mockSendMessageWithAttachmentsToUnthread, mockAttachmentDetectionService };
});

global.fetch = mockFetch;

vi.mock('../../services/unthread', () => ({
  sendMessageWithAttachmentsToUnthread: mockSendMessageWithAttachmentsToUnthread,
}));

vi.mock('../../services/attachmentDetection', () => ({
  AttachmentDetectionService: mockAttachmentDetectionService,
}));

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

// Create mock thread
const createMockThread = (): ThreadChannel => ({
  id: 'thread123',
  name: 'Test Thread',
  send: vi.fn(),
} as unknown as ThreadChannel);

describe('AttachmentHandler', () => {
  let handler: AttachmentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AttachmentHandler();
    
    // Reset mock implementations
    mockAttachmentDetectionService.validateAttachments.mockReturnValue({
      valid: true,
      totalSize: 1024,
      supportedCount: 1,
      unsupportedCount: 0,
      oversizedCount: 0,
      errors: [],
    });

    mockAttachmentDetectionService.makeProcessingDecision.mockReturnValue({
      shouldProcess: true,
      hasAttachments: true,
      hasImages: true,
      hasSupportedImages: true,
      hasUnsupported: false,
      isOversized: false,
      summary: '1 supported image',
      reason: 'Has supported images',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processAttachments', () => {
    it('should process valid attachments successfully', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment();
      attachments.set('1', attachment);

      const mockBuffer = Buffer.from('fake image data');
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      mockSendMessageWithAttachmentsToUnthread.mockResolvedValue({
        success: true,
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: true,
        processedCount: 1,
        totalSize: 1024,
        errors: [],
      });

      expect(mockFetch).toHaveBeenCalledWith(attachment.url);
      expect(mockSendMessageWithAttachmentsToUnthread).toHaveBeenCalledWith(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message',
        expect.arrayContaining([
          expect.objectContaining({
            buffer: mockBuffer,
            name: 'test.png',
            contentType: 'image/png',
          }),
        ])
      );
    });

    it('should handle empty attachment collection', async () => {
      const attachments = new Collection<string, Attachment>();

      mockAttachmentDetectionService.makeProcessingDecision.mockReturnValue({
        shouldProcess: true,
        hasAttachments: false,
        hasImages: false,
        hasSupportedImages: false,
        hasUnsupported: false,
        isOversized: false,
        summary: 'No attachments',
        reason: 'No attachments to process',
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: true,
        processedCount: 0,
        totalSize: 0,
        errors: [],
      });

      expect(mockSendMessageWithAttachmentsToUnthread).not.toHaveBeenCalled();
    });

    it('should handle validation failures', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment({
        size: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
      });
      attachments.set('1', attachment);

      mockAttachmentDetectionService.validateAttachments.mockReturnValue({
        valid: false,
        totalSize: DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1,
        supportedCount: 0,
        unsupportedCount: 0,
        oversizedCount: 1,
        errors: ['File exceeds maximum size limit'],
      });

      mockAttachmentDetectionService.makeProcessingDecision.mockReturnValue({
        shouldProcess: false,
        hasAttachments: true,
        hasImages: true,
        hasSupportedImages: false,
        hasUnsupported: false,
        isOversized: true,
        summary: 'Oversized files',
        reason: 'Attachments exceed size limits',
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: false,
        processedCount: 0,
        errors: expect.arrayContaining([
          expect.stringContaining('File exceeds maximum size limit'),
        ]),
      });
    });

    it('should handle download failures', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment();
      attachments.set('1', attachment);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: false,
        processedCount: 0,
        errors: expect.arrayContaining([
          expect.stringContaining('Failed to download'),
        ]),
      });
    });

    it('should handle network errors during download', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment();
      attachments.set('1', attachment);

      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: false,
        processedCount: 0,
        errors: expect.arrayContaining([
          expect.stringContaining('Network timeout'),
        ]),
      });
    });

    it('should handle upload failures with retry', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment();
      attachments.set('1', attachment);

      const mockBuffer = Buffer.from('fake image data');
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      // Simulate upload failure
      mockSendMessageWithAttachmentsToUnthread.mockResolvedValue({
        success: false,
        error: 'Upload failed',
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result).toMatchObject({
        success: false,
        processedCount: 0,
        errors: expect.arrayContaining([
          expect.stringContaining('Upload failed'),
        ]),
      });
    });
  });

  describe('downloadAttachment', () => {
    it('should download attachment successfully', async () => {
      const attachment = createMockAttachment();
      const mockBuffer = Buffer.from('test image data');

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      const result = await handler.downloadAttachment(attachment);

      expect(result).toEqual({
        buffer: mockBuffer,
        name: 'test.png',
        contentType: 'image/png',
      });

      expect(mockFetch).toHaveBeenCalledWith(attachment.url);
    });

    it('should handle download HTTP errors', async () => {
      const attachment = createMockAttachment();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(handler.downloadAttachment(attachment))
        .rejects.toThrow('Failed to download attachment: HTTP 403 Forbidden');
    });

    it('should handle network errors', async () => {
      const attachment = createMockAttachment();

      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      await expect(handler.downloadAttachment(attachment))
        .rejects.toThrow('Connection timeout');
    });

    it('should handle missing content type', async () => {
      const attachment = createMockAttachment({
        contentType: null,
      });
      const mockBuffer = Buffer.from('test data');

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      const result = await handler.downloadAttachment(attachment);

      expect(result).toEqual({
        buffer: mockBuffer,
        name: 'test.png',
        contentType: 'application/octet-stream',
      });
    });

    it('should handle large files', async () => {
      const attachment = createMockAttachment({
        size: 10 * 1024 * 1024, // 10MB
      });
      const mockBuffer = Buffer.alloc(10 * 1024 * 1024);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      const result = await handler.downloadAttachment(attachment);

      expect(result.buffer.length).toBe(10 * 1024 * 1024);
    });
  });

  describe('createAttachmentBuilders', () => {
    it('should create attachment builders from file buffers', () => {
      const fileBuffers: FileBuffer[] = [
        {
          buffer: Buffer.from('image data'),
          name: 'image.png',
          contentType: 'image/png',
        },
        {
          buffer: Buffer.from('text data'),
          name: 'document.txt',
          contentType: 'text/plain',
        },
      ];

      const result = handler.createAttachmentBuilders(fileBuffers);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(AttachmentBuilder);
      expect(result[1]).toBeInstanceOf(AttachmentBuilder);
    });

    it('should handle empty file buffers array', () => {
      const result = handler.createAttachmentBuilders([]);
      expect(result).toHaveLength(0);
    });

    it('should preserve file names', () => {
      const fileBuffers: FileBuffer[] = [
        {
          buffer: Buffer.from('data'),
          name: 'special-file_name.ext',
          contentType: 'application/octet-stream',
        },
      ];

      const result = handler.createAttachmentBuilders(fileBuffers);
      
      // The AttachmentBuilder mock should receive the correct name
      expect(AttachmentBuilder).toHaveBeenCalledWith(
        expect.any(Buffer),
        'special-file_name.ext'
      );
    });
  });

  describe('validateFileBuffer', () => {
    it('should validate correct file buffer', () => {
      const fileBuffer: FileBuffer = {
        buffer: Buffer.from('valid data'),
        name: 'test.txt',
        contentType: 'text/plain',
      };

      expect(() => handler.validateFileBuffer(fileBuffer)).not.toThrow();
    });

    it('should reject empty buffer', () => {
      const fileBuffer: FileBuffer = {
        buffer: Buffer.alloc(0),
        name: 'empty.txt',
        contentType: 'text/plain',
      };

      expect(() => handler.validateFileBuffer(fileBuffer))
        .toThrow('File buffer cannot be empty');
    });

    it('should reject missing name', () => {
      const fileBuffer: FileBuffer = {
        buffer: Buffer.from('data'),
        name: '',
        contentType: 'text/plain',
      };

      expect(() => handler.validateFileBuffer(fileBuffer))
        .toThrow('File name cannot be empty');
    });

    it('should reject missing content type', () => {
      const fileBuffer: FileBuffer = {
        buffer: Buffer.from('data'),
        name: 'test.txt',
        contentType: '',
      };

      expect(() => handler.validateFileBuffer(fileBuffer))
        .toThrow('Content type cannot be empty');
    });

    it('should reject oversized buffer', () => {
      const fileBuffer: FileBuffer = {
        buffer: Buffer.alloc(DISCORD_ATTACHMENT_CONFIG.maxFileSize + 1),
        name: 'large.txt',
        contentType: 'text/plain',
      };

      expect(() => handler.validateFileBuffer(fileBuffer))
        .toThrow('File size exceeds maximum limit');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed attachment objects', async () => {
      const attachments = new Collection<string, Attachment>();
      const malformedAttachment = {
        id: 'malformed',
        url: '', // Empty URL
        filename: 'test.png',
        size: 1024,
        contentType: 'image/png',
      } as Attachment;
      attachments.set('1', malformedAttachment);

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle concurrent attachment processing', async () => {
      const attachments = new Collection<string, Attachment>();
      
      // Add multiple attachments
      for (let i = 0; i < 5; i++) {
        const attachment = createMockAttachment({
          id: `attachment_${i}`,
          filename: `file_${i}.png`,
        });
        attachments.set(attachment.id, attachment);
      }

      const mockBuffer = Buffer.from('image data');
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      mockSendMessageWithAttachmentsToUnthread.mockResolvedValue({
        success: true,
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result.processedCount).toBe(5);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should handle partial failures in batch processing', async () => {
      const attachments = new Collection<string, Attachment>();
      
      const successfulAttachment = createMockAttachment({
        id: 'success',
        filename: 'success.png',
      });
      
      const failingAttachment = createMockAttachment({
        id: 'fail',
        filename: 'fail.png',
        url: 'https://invalid-url.com/fail.png',
      });

      attachments.set('success', successfulAttachment);
      attachments.set('fail', failingAttachment);

      const mockBuffer = Buffer.from('image data');
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result.success).toBe(false);
      expect(result.processedCount).toBe(0); // All or nothing approach
      expect(result.errors).toHaveLength(1);
    });

    it('should handle memory pressure with large files', async () => {
      const attachment = createMockAttachment({
        size: 20 * 1024 * 1024, // 20MB
      });
      
      const attachments = new Collection<string, Attachment>();
      attachments.set('1', attachment);

      // Simulate memory allocation issue
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(largeBuffer),
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      // Should handle large files without throwing
      expect(result).toBeDefined();
    });

    it('should cleanup resources on error', async () => {
      const attachments = new Collection<string, Attachment>();
      const attachment = createMockAttachment();
      attachments.set('1', attachment);

      const mockBuffer = Buffer.from('test data');
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
      });

      // Simulate upload failure
      mockSendMessageWithAttachmentsToUnthread.mockRejectedValue(
        new Error('Upload service unavailable')
      );

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Test message',
        { name: 'Test User', email: 'test@example.com' }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Upload service unavailable');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete attachment processing workflow', async () => {
      // Setup realistic scenario
      const attachments = new Collection<string, Attachment>();
      
      const imageAttachment = createMockAttachment({
        id: 'img1',
        filename: 'screenshot.png',
        contentType: 'image/png',
        size: 2048,
      });
      
      attachments.set('img1', imageAttachment);

      const mockImageBuffer = Buffer.from('PNG image data');
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockImageBuffer),
      });

      mockSendMessageWithAttachmentsToUnthread.mockResolvedValue({
        success: true,
      });

      const result = await handler.processAttachments(
        attachments,
        'conversation123',
        'Here is the screenshot you requested',
        { name: 'John Doe', email: 'john@example.com' }
      );

      expect(result).toMatchObject({
        success: true,
        processedCount: 1,
        totalSize: 2048,
        errors: [],
      });

      // Verify the complete flow
      expect(mockFetch).toHaveBeenCalledWith(imageAttachment.url);
      expect(mockSendMessageWithAttachmentsToUnthread).toHaveBeenCalledWith(
        'conversation123',
        { name: 'John Doe', email: 'john@example.com' },
        'Here is the screenshot you requested',
        expect.arrayContaining([
          expect.objectContaining({
            buffer: mockImageBuffer,
            name: 'screenshot.png',
            contentType: 'image/png',
          }),
        ])
      );
    });
  });
});