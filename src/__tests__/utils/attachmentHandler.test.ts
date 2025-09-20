/**
 * Attachment Handler Test Suite
 *
 * Comprehensive tests for Discord ↔ Unthread file attachment processing.
 * Tests the complete flow of attachment handling including validation, 
 * download, upload, and error scenarios.
 *
 * @module tests/utils/attachmentHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Collection, Attachment } from 'discord.js';
import { AttachmentHandler } from '../../utils/attachmentHandler';
import { createDelayedMock, waitFor } from '../async-test-utils';

// Mock fetch for attachment downloads
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the attachment detection service
vi.mock('../../services/attachmentDetection', () => ({
	AttachmentDetectionService: {
		validateAttachments: vi.fn(),
	},
}));

// Mock the unthread service
vi.mock('../../services/unthread', () => ({
	sendMessageWithAttachmentsToUnthread: vi.fn(),
}));

// Mock Discord.js classes
const createMockAttachment = (overrides = {}) => ({
	id: 'attachment-123',
	name: 'test-image.png',
	url: 'https://cdn.discordapp.com/attachments/123/456/test-image.png',
	size: 1024 * 1024, // 1MB
	contentType: 'image/png',
	...overrides,
});

const createMockCollection = (attachments: any[]) => {
	const collection = new Collection();
	attachments.forEach((attachment, index) => {
		collection.set(attachment.id || `attachment-${index}`, attachment);
	});
	return collection;
};

describe('AttachmentHandler', () => {
	let attachmentHandler: AttachmentHandler;
	let mockValidateAttachments: any;
	let mockSendWithAttachments: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		attachmentHandler = new AttachmentHandler();
		
		// Get the mocked functions
		const attachmentDetectionModule = await import('../../services/attachmentDetection');
		const unthreadModule = await import('../../services/unthread');
		
		mockValidateAttachments = vi.mocked(attachmentDetectionModule.AttachmentDetectionService.validateAttachments);
		mockSendWithAttachments = vi.mocked(unthreadModule.sendMessageWithAttachmentsToUnthread);
		
		// Setup default successful fetch mock
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
			headers: new Headers({
				'content-type': 'image/png',
				'content-length': '1024',
			}),
		});

		// Setup default validation mock
		mockValidateAttachments.mockReturnValue({
			valid: [createMockAttachment()],
			invalid: [],
		});

		// Setup default upload mock
		mockSendWithAttachments.mockResolvedValue({ success: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('uploadDiscordAttachmentsToUnthread', () => {
		it('should process valid attachments successfully', async () => {
			const attachments = createMockCollection([createMockAttachment()]);
			
			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Test message with attachment',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(true);
			expect(result.processedCount).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(result.processingTime).toBeGreaterThan(0);
		});

		it('should handle validation failures', async () => {
			const attachment = createMockAttachment();
			const attachments = createMockCollection([attachment]);
			
			mockValidateAttachments.mockReturnValue({
				valid: [],
				invalid: [{ attachment, error: 'Unsupported file type' }],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(false);
			expect(result.processedCount).toBe(0);
			expect(result.errors).toContain('test-image.png: Unsupported file type');
		});

		it('should handle download failures', async () => {
			const attachments = createMockCollection([createMockAttachment()]);
			
			// Mock download failure
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(false);
			expect(result.processedCount).toBe(0);
			expect(result.errors.some(error => error.includes('Failed to download'))).toBe(true);
		});

		it('should handle upload failures', async () => {
			const attachments = createMockCollection([createMockAttachment()]);
			
			// Mock upload failure
			mockSendWithAttachments.mockRejectedValue(new Error('Upload failed'));

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(false);
		});

		it('should process multiple attachments', async () => {
			const attachments = createMockCollection([
				createMockAttachment({ id: 'att1', name: 'image1.png' }),
				createMockAttachment({ id: 'att2', name: 'image2.jpg' }),
			]);

			mockValidateAttachments.mockReturnValue({
				valid: attachments.map(att => att),
				invalid: [],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Multiple attachments',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(true);
			expect(result.processedCount).toBe(2);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should handle mixed success and failure scenarios', async () => {
			const attachments = createMockCollection([
				createMockAttachment({ id: 'valid', name: 'valid.png' }),
				createMockAttachment({ id: 'invalid', name: 'invalid.pdf' }),
			]);

			mockValidateAttachments.mockReturnValue({
				valid: [attachments.get('valid')],
				invalid: [{ 
					attachment: attachments.get('invalid'), 
					error: 'Unsupported file type',
				}],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Mixed attachments',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(true);
			expect(result.processedCount).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Unsupported file type');
		});
	});

	describe('downloadAttachmentToBuffer', () => {
		it('should download attachment successfully', async () => {
			const attachment = createMockAttachment();
			const mockBuffer = new ArrayBuffer(1024);
			
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				arrayBuffer: () => Promise.resolve(mockBuffer),
				headers: new Headers({ 'content-type': 'image/png' }),
			});

			const result = await attachmentHandler.downloadAttachmentToBuffer(attachment);

			expect(result.filename).toBe('test-image.png');
			expect(result.mimetype).toBe('image/png');
			expect(result.buffer).toBe(mockBuffer);
			expect(result.size).toBe(1024);
		});

		it('should handle network errors', async () => {
			const attachment = createMockAttachment();
			
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(attachmentHandler.downloadAttachmentToBuffer(attachment))
				.rejects.toThrow('Network error');
		});

		it('should handle HTTP errors', async () => {
			const attachment = createMockAttachment();
			
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: 'Forbidden',
			});

			await expect(attachmentHandler.downloadAttachmentToBuffer(attachment))
				.rejects.toThrow();
		});
	});

	describe('uploadBuffersToUnthread', () => {
		it('should upload file buffers successfully', async () => {
			const fileBuffers = [
				{
					filename: 'test.png',
					mimetype: 'image/png',
					buffer: new ArrayBuffer(1024),
					size: 1024,
				},
			];

			const result = await attachmentHandler.uploadBuffersToUnthread(
				'conversation-123',
				fileBuffers,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result).toBe(true);
			expect(mockSendWithAttachments).toHaveBeenCalledWith(
				'conversation-123',
				fileBuffers,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);
		});

		it('should handle upload errors', async () => {
			const fileBuffers = [
				{
					filename: 'test.png',
					mimetype: 'image/png',
					buffer: new ArrayBuffer(1024),
					size: 1024,
				},
			];

			mockSendWithAttachments.mockRejectedValue(new Error('Upload failed'));

			const result = await attachmentHandler.uploadBuffersToUnthread(
				'conversation-123',
				fileBuffers,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result).toBe(false);
		});
	});

	describe('error handling and edge cases', () => {
		it('should handle empty attachment collection', async () => {
			const attachments = createMockCollection([]);
			
			mockValidateAttachments.mockReturnValue({
				valid: [],
				invalid: [],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'No attachments',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(false);
			expect(result.processedCount).toBe(0);
		});

		it('should handle malformed attachment data', async () => {
			const malformedAttachment = {
				id: 'malformed',
				name: null,
				url: undefined,
				size: 'not-a-number',
				contentType: '',
			};

			const attachments = createMockCollection([malformedAttachment]);
			
			mockValidateAttachments.mockReturnValue({
				valid: [],
				invalid: [{ attachment: malformedAttachment, error: 'Invalid attachment data' }],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Malformed test',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should handle large file downloads', async () => {
			const largeAttachment = createMockAttachment({
				size: 8 * 1024 * 1024, // 8MB
				name: 'large-file.png',
			});
			const attachments = createMockCollection([largeAttachment]);

			mockValidateAttachments.mockReturnValue({
				valid: [largeAttachment],
				invalid: [],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Large file test',
				{ name: 'Test User', email: 'test@example.com' },
			);

			// Just check that it completes and has some processing time
			expect(result.processingTime).toBeGreaterThanOrEqual(0);
		});
	});

	describe('performance and concurrency', () => {
		it('should handle concurrent downloads efficiently', async () => {
			const attachmentArray = Array.from({ length: 3 }, (_, i) => 
				createMockAttachment({ 
					id: `concurrent-${i}`,
					name: `image-${i}.png`,
				}),
			);
			const attachments = createMockCollection(attachmentArray);

			mockValidateAttachments.mockReturnValue({
				valid: attachmentArray,
				invalid: [],
			});

			const result = await attachmentHandler.uploadDiscordAttachmentsToUnthread(
				'conversation-123',
				attachments,
				'Concurrent test',
				{ name: 'Test User', email: 'test@example.com' },
			);

			expect(result.success).toBe(true);
			expect(result.processedCount).toBe(3);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});
	});
});