/**
 * @fileoverview Tests for AttachmentHandler
 * 
 * Test suite for the Discord attachment processing system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Collection, Attachment } from 'discord.js';
import { AttachmentHandler } from '../../utils/attachmentHandler';

// Mock dependencies using vi.hoisted to ensure proper hoisting
const { mockFetch, mockSendMessageWithAttachmentsToUnthread, mockAttachmentDetectionService } = vi.hoisted(() => {
	const mockFetch = vi.fn();
	const mockSendMessageWithAttachmentsToUnthread = vi.fn();
	const mockAttachmentDetectionService = {
		validateAttachments: vi.fn(),
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
	name: 'test.png',
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

describe('AttachmentHandler', () => {
	let handler: AttachmentHandler;

	beforeEach(() => {
		vi.clearAllMocks();
		handler = new AttachmentHandler();

		// Reset mock implementations
		mockAttachmentDetectionService.validateAttachments.mockReturnValue({
			valid: [createMockAttachment()],
			invalid: [],
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('uploadDiscordAttachmentsToUnthread', () => {
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

			const result = await handler.uploadDiscordAttachmentsToUnthread(
				'conversation123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' }
			);

			expect(result).toMatchObject({
				success: true,
				processedCount: 1,
				errors: [],
			});

			expect(mockFetch).toHaveBeenCalledWith(attachment.url, {
				method: 'GET',
				signal: expect.any(AbortSignal),
			});

			expect(mockSendMessageWithAttachmentsToUnthread).toHaveBeenCalledWith(
				'conversation123',
				{ name: 'Test User', email: 'test@example.com' },
				'Test message',
				expect.arrayContaining([
					expect.objectContaining({
						buffer: mockBuffer,
						fileName: 'test.png',
						mimeType: 'image/png',
					}),
				])
			);
		});

		it('should handle validation errors', async () => {
			const attachments = new Collection<string, Attachment>();
			const attachment = createMockAttachment();
			attachments.set('1', attachment);

			mockAttachmentDetectionService.validateAttachments.mockReturnValue({
				valid: [],
				invalid: [{ attachment, error: 'File too large' }],
			});

			const result = await handler.uploadDiscordAttachmentsToUnthread(
				'conversation123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' }
			);

			expect(result).toMatchObject({
				success: false,
				processedCount: 0,
				errors: expect.arrayContaining(['test.png: File too large']),
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

			const result = await handler.uploadDiscordAttachmentsToUnthread(
				'conversation123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' }
			);

			expect(result).toMatchObject({
				success: false,
				processedCount: 0,
				errors: expect.arrayContaining([
					expect.stringContaining('Failed to download test.png')
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

			mockSendMessageWithAttachmentsToUnthread.mockResolvedValue({
				success: false,
				error: 'Upload failed',
			});

			const result = await handler.uploadDiscordAttachmentsToUnthread(
				'conversation123',
				attachments,
				'Test message',
				{ name: 'Test User', email: 'test@example.com' }
			);

			expect(result).toMatchObject({
				success: false,
				processedCount: 1,
				errors: [],
			});

			// Should retry multiple times
			expect(mockSendMessageWithAttachmentsToUnthread).toHaveBeenCalledTimes(3);
		});
	});
});
