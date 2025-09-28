/**
 * Test Suite: Message Create Event Handler
 *
 * Tests for the message creation event handler that processes all incoming messages,
 * forwards thread messages to Unthread, handles attachments, and processes legacy commands.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events, Message, ThreadChannel, Collection } from 'discord.js';
import { LogEngine } from '@config/logger';
import { sendMessageToUnthread, getTicketByDiscordThreadId, getCustomerById } from '@services/unthread';
import { isValidatedForumChannel } from '@utils/channelUtils';
import { AttachmentHandler } from '@utils/attachmentHandler';
import { AttachmentDetectionService } from '@services/attachmentDetection';
import { getConfig } from '@config/defaults';
import { name, execute, once } from '@events/messageCreate';

// Mock all external dependencies
vi.mock('@services/unthread');
vi.mock('@utils/channelUtils');
vi.mock('@utils/attachmentHandler');
vi.mock('@services/attachmentDetection');
vi.mock('@config/defaults');

describe('Message Create Event Handler', () => {
	let mockMessage: Partial<Message>;
	let mockThreadChannel: Partial<ThreadChannel>;
	let mockAttachmentHandler: any;

	beforeEach(() => {
		vi.clearAllMocks();
		
		// Mock attachment handler
		mockAttachmentHandler = {
			uploadDiscordAttachmentsToUnthread: vi.fn().mockResolvedValue({
				success: true,
				processedCount: 1,
				processingTime: 150,
			}),
		};
		(AttachmentHandler as any).mockImplementation(() => mockAttachmentHandler);

		// Mock thread channel
		mockThreadChannel = {
			id: 'thread_123',
			parentId: 'forum_channel_123',
			isThread: vi.fn().mockReturnValue(true),
			messages: {
				fetch: vi.fn().mockResolvedValue({
					content: 'Original quoted message',
				}),
			} as any,
		};

		// Mock message
		mockMessage = {
			id: 'message_123',
			content: 'Hello, I need help with my account',
			author: {
				id: 'user_123',
				username: 'testuser',
				displayName: 'Test User',
				bot: false,
			} as any,
			channel: mockThreadChannel as ThreadChannel,
			createdTimestamp: Date.now() - 1000,
			attachments: new Collection(),
			reference: null,
			reply: vi.fn().mockResolvedValue({ id: 'reply_message_id' }),
			react: vi.fn().mockResolvedValue({}),
		};

		// Setup default mock returns
		(isValidatedForumChannel as any).mockResolvedValue(true);
		(getTicketByDiscordThreadId as any).mockResolvedValue({
			unthreadTicketId: 'ticket_123',
			discordThreadId: 'thread_123',
		});
		(getCustomerById as any).mockResolvedValue({
			email: 'test@example.com',
		});
		(sendMessageToUnthread as any).mockResolvedValue({ success: true });
		(getConfig as any).mockReturnValue('example.com');
		(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(new Collection());
	});

	describe('Event Configuration', () => {
		it('should export correct event name', () => {
			expect(name).toBe(Events.MessageCreate);
		});

		it('should be configured as recurring event (not once)', () => {
			expect(once).toBe(false);
		});
	});

	describe('Bot Message Filtering', () => {
		it('should ignore bot messages', async () => {
			mockMessage.author!.bot = true;

			await execute(mockMessage as Message);

			expect(getTicketByDiscordThreadId).not.toHaveBeenCalled();
			expect(sendMessageToUnthread).not.toHaveBeenCalled();
		});

		it('should process user messages', async () => {
			mockMessage.author!.bot = false;

			await execute(mockMessage as Message);

			expect(getTicketByDiscordThreadId).toHaveBeenCalled();
		});
	});

	describe('Thread Message Processing', () => {
		it('should skip non-thread messages', async () => {
			(mockMessage.channel as any).isThread = vi.fn().mockReturnValue(false);

			await execute(mockMessage as Message);

			expect(getTicketByDiscordThreadId).not.toHaveBeenCalled();
		});

		it('should skip forum posts that created the thread', async () => {
			// Make message ID match thread ID (indicating this is the forum post)
			mockMessage.id = mockThreadChannel.id;

			await execute(mockMessage as Message);

			expect(LogEngine.debug).toHaveBeenCalledWith(
				`Skipping forum post ID ${mockMessage.id} that created thread ${mockThreadChannel.id}`
			);
			expect(getTicketByDiscordThreadId).not.toHaveBeenCalled();
		});

		it('should process regular thread messages', async () => {
			await execute(mockMessage as Message);

			expect(getTicketByDiscordThreadId).toHaveBeenCalledWith('thread_123');
		});

		it('should skip messages in non-validated forum channels', async () => {
			(isValidatedForumChannel as any).mockResolvedValue(false);
			mockMessage.id = mockThreadChannel.id; // Make it look like a forum post

			await execute(mockMessage as Message);

			// Should not skip because it's not a validated forum channel
			expect(getTicketByDiscordThreadId).toHaveBeenCalled();
		});

		it('should handle missing parent ID gracefully', async () => {
			mockThreadChannel.parentId = null;

			await execute(mockMessage as Message);

			expect(isValidatedForumChannel).toHaveBeenCalledWith('');
		});
	});

	describe('Ticket Mapping and Message Forwarding', () => {
		it('should forward messages when ticket mapping exists', async () => {
			await execute(mockMessage as Message);

			expect(sendMessageToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockMessage.author,
				'Hello, I need help with my account',
				'test@example.com'
			);
		});

		it('should skip forwarding when no ticket mapping exists', async () => {
			(getTicketByDiscordThreadId as any).mockResolvedValue(null);

			await execute(mockMessage as Message);

			expect(sendMessageToUnthread).not.toHaveBeenCalled();
		});

		it('should use fallback email when customer has no email', async () => {
			(getCustomerById as any).mockResolvedValue(null);

			await execute(mockMessage as Message);

			expect(sendMessageToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockMessage.author,
				'Hello, I need help with my account',
				'testuser@example.com'
			);
		});

		it('should use customer email when available', async () => {
			(getCustomerById as any).mockResolvedValue({
				email: 'customer@example.com',
			});

			await execute(mockMessage as Message);

			expect(sendMessageToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockMessage.author,
				'Hello, I need help with my account',
				'customer@example.com'
			);
		});
	});

	describe('Quote/Reply Context Handling', () => {
		it('should handle quoted messages', async () => {
			mockMessage.reference = {
				messageId: 'quoted_message_123',
			} as any;

			await execute(mockMessage as Message);

			expect(mockThreadChannel.messages!.fetch).toHaveBeenCalledWith('quoted_message_123');
			expect(sendMessageToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockMessage.author,
				'> Original quoted message\n\nHello, I need help with my account',
				'test@example.com'
			);
		});

		it('should handle quote fetch errors gracefully', async () => {
			mockMessage.reference = {
				messageId: 'quoted_message_123',
			} as any;
			(mockThreadChannel.messages!.fetch as any).mockRejectedValue(new Error('Message not found'));

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error fetching the referenced message:',
				expect.any(Error)
			);
			// Should still send original message
			expect(sendMessageToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockMessage.author,
				'Hello, I need help with my account',
				'test@example.com'
			);
		});

		it('should add debug log when quote context is added', async () => {
			mockMessage.reference = {
				messageId: 'quoted_message_123',
			} as any;

			await execute(mockMessage as Message);

			expect(LogEngine.debug).toHaveBeenCalledWith(
				'Added quote context from message quoted_message_123'
			);
		});
	});

	describe('Attachment Handling', () => {
		it('should process image attachments', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1', url: 'https://example.com/image.png' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);

			await execute(mockMessage as Message);

			expect(AttachmentDetectionService.filterSupportedImages).toHaveBeenCalledWith(mockAttachments);
			expect(mockAttachmentHandler.uploadDiscordAttachmentsToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockAttachments,
				'Hello, I need help with my account',
				{
					name: 'Test User',
					email: 'test@example.com',
				}
			);
		});

		it('should handle successful attachment uploads', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);

			await execute(mockMessage as Message);

			expect(LogEngine.info).toHaveBeenCalledWith(
				'Successfully uploaded 1 attachments for ticket ticket_123 in 150ms'
			);
			expect(mockMessage.react).toHaveBeenCalledWith('📎');
		});

		it('should handle attachment upload failures', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);
			mockAttachmentHandler.uploadDiscordAttachmentsToUnthread.mockResolvedValue({
				success: false,
				processedCount: 0,
				errors: ['Upload failed'],
				processingTime: 100,
			});

			await execute(mockMessage as Message);

			expect(LogEngine.warn).toHaveBeenCalledWith(
				'Attachment upload failed: Upload failed. Falling back to text message.'
			);
		});

		it('should handle reaction errors gracefully', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);
			(mockMessage.react as any).mockRejectedValue(new Error('Cannot add reaction'));

			await execute(mockMessage as Message);

			expect(LogEngine.debug).toHaveBeenCalledWith(
				'Could not add reaction to message:',
				expect.any(Error)
			);
		});

		it('should use fallback message for empty content with attachments', async () => {
			mockMessage.content = '';
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);

			await execute(mockMessage as Message);

			expect(mockAttachmentHandler.uploadDiscordAttachmentsToUnthread).toHaveBeenCalledWith(
				'ticket_123',
				mockAttachments,
				'Files uploaded',
				expect.any(Object)
			);
		});

		it('should skip attachment processing when no supported images found', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(new Collection());

			await execute(mockMessage as Message);

			expect(mockAttachmentHandler.uploadDiscordAttachmentsToUnthread).not.toHaveBeenCalled();
		});
	});

	describe('Legacy Commands', () => {
		beforeEach(() => {
			// Make message not in a thread for legacy command testing
			(mockMessage.channel as any).isThread = vi.fn().mockReturnValue(false);
		});

		it('should respond to !!ping command', async () => {
			mockMessage.content = '!!ping';
			mockMessage.createdTimestamp = Date.now() - 500; // 500ms ago

			await execute(mockMessage as Message);

			expect(mockMessage.reply).toHaveBeenCalledWith(
				expect.stringMatching(/Latency is \d+ms\./)
			);
			expect(LogEngine.info).toHaveBeenCalledWith(
				expect.stringMatching(/Responded to ping command with latency \d+ms/)
			);
		});

		it('should respond to !!version command', async () => {
			mockMessage.content = '!!version';

			await execute(mockMessage as Message);

			expect(mockMessage.reply).toHaveBeenCalledWith(
				expect.stringMatching(/Version: .*/)
			);
			expect(LogEngine.info).toHaveBeenCalledWith(
				expect.stringMatching(/Responded to version command with version .*/)
			);
		});

		it('should not respond to partial command matches', async () => {
			mockMessage.content = '!!pin'; // Missing g

			await execute(mockMessage as Message);

			expect(mockMessage.reply).not.toHaveBeenCalled();
		});

		it('should not respond to commands with extra text', async () => {
			mockMessage.content = '!!ping please';

			await execute(mockMessage as Message);

			expect(mockMessage.reply).not.toHaveBeenCalled();
		});

		it('should process legacy commands even in threads', async () => {
			(mockMessage.channel as any).isThread = vi.fn().mockReturnValue(true);
			(getTicketByDiscordThreadId as any).mockResolvedValue(null); // No ticket mapping
			mockMessage.content = '!!ping';

			await execute(mockMessage as Message);

			expect(mockMessage.reply).toHaveBeenCalledWith(
				expect.stringMatching(/Latency is \d+ms\./)
			);
		});
	});

	describe('Error Handling', () => {
		it('should handle message forwarding errors', async () => {
			const forwardingError = new Error('Unthread API failed');
			(sendMessageToUnthread as any).mockRejectedValue(forwardingError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error sending message to Unthread:',
				forwardingError
			);
		});

		it('should handle customer lookup errors', async () => {
			const customerError = new Error('Customer service failed');
			(getCustomerById as any).mockRejectedValue(customerError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error sending message to Unthread:',
				customerError
			);
		});

		it('should handle ticket mapping lookup errors', async () => {
			const mappingError = new Error('Database connection failed');
			(getTicketByDiscordThreadId as any).mockRejectedValue(mappingError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error sending message to Unthread:',
				mappingError
			);
		});

		it('should handle forum channel validation errors', async () => {
			const validationError = new Error('Channel validation failed');
			(isValidatedForumChannel as any).mockRejectedValue(validationError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error sending message to Unthread:',
				validationError
			);
		});
	});

	describe('Integration Testing', () => {
		it('should complete full message processing workflow', async () => {
			const mockAttachments = new Collection();
			mockAttachments.set('attachment1', { id: 'attachment1' });
			mockMessage.attachments = mockAttachments;
			mockMessage.reference = { messageId: 'quoted_123' } as any;
			(AttachmentDetectionService.filterSupportedImages as any).mockReturnValue(mockAttachments);

			await execute(mockMessage as Message);

			// Verify the complete workflow
			expect(isValidatedForumChannel).toHaveBeenCalled();
			expect(getTicketByDiscordThreadId).toHaveBeenCalled();
			expect(getCustomerById).toHaveBeenCalled();
			expect(AttachmentDetectionService.filterSupportedImages).toHaveBeenCalled();
			expect(mockAttachmentHandler.uploadDiscordAttachmentsToUnthread).toHaveBeenCalled();
			expect(mockMessage.react).toHaveBeenCalledWith('📎');
		});

		it('should handle mixed content and legacy commands', async () => {
			// First call - thread message
			await execute(mockMessage as Message);
			
			// Second call - legacy command (simulate different message)
			mockMessage.content = '!!ping';
			(mockMessage.channel as any).isThread = vi.fn().mockReturnValue(false);
			await execute(mockMessage as Message);

			expect(sendMessageToUnthread).toHaveBeenCalled();
			expect(mockMessage.reply).toHaveBeenCalled();
		});
	});

	describe('Module Structure', () => {
		it('should export required properties', () => {
			expect(name).toBeDefined();
			expect(execute).toBeDefined();
			expect(once).toBeDefined();
			expect(typeof execute).toBe('function');
		});

		it('should have async execute function', () => {
			expect(execute.constructor.name).toBe('AsyncFunction');
		});
	});
});