/**
 * Test Suite: Thread Create Event Handler
 *
 * Tests for the thread creation event handler that converts new forum posts
 * in validated forum channels to Unthread support tickets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events, ThreadChannel, Message, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { LogEngine } from '@config/logger';
import { createTicket, bindTicketWithThread } from '@services/unthread';
import { withRetry } from '@utils/retry';
import { fetchStarterMessage } from '@utils/threadUtils';
import { getOrCreateCustomer } from '@utils/customerUtils';
import { isValidatedForumChannel } from '@utils/channelUtils';
import { getBotFooter } from '@utils/botUtils';
import { name, execute } from '@events/threadCreate';

// Mock all external dependencies
vi.mock('@services/unthread');
vi.mock('@utils/retry');
vi.mock('@utils/threadUtils');
vi.mock('@utils/customerUtils');
vi.mock('@utils/channelUtils');
vi.mock('@utils/botUtils');

describe('Thread Create Event Handler', () => {
	let mockThread: Partial<ThreadChannel>;
	let mockMessage: Partial<Message>;
	let mockBotMember: any;
	let mockPermissions: any;

	beforeEach(() => {
		vi.clearAllMocks();
		
		// Mock permissions object with specific behavior for testing
		mockPermissions = {
			has: vi.fn().mockImplementation((perms: any) => {
				// Default to true unless overridden in specific tests
				return true;
			}),
		};

		// Mock bot member
		mockBotMember = {
			permissionsIn: vi.fn().mockReturnValue(mockPermissions),
		};

		// Mock starter message
		mockMessage = {
			id: 'starter_message_id',
			content: 'This is a support request for help with my account.',
			author: {
				id: 'user_123',
				username: 'testuser',
				displayName: 'Test User',
				bot: false,
			} as any,
		};

		// Mock thread channel
		mockThread = {
			id: 'thread_123',
			name: 'Help with Account Issues',
			parentId: 'forum_channel_123',
			guild: {
				id: 'guild_123',
				name: 'Test Guild',
				members: {
					me: mockBotMember,
				},
			} as any,
			parent: {
				id: 'forum_channel_123',
				name: 'support-forum',
			} as any,
			send: vi.fn().mockResolvedValue({ id: 'sent_message_id' }),
		};

		// Setup default mock returns
		(isValidatedForumChannel as any).mockResolvedValue(true);
		(withRetry as any).mockImplementation(async (fn: Function) => await fn());
		(fetchStarterMessage as any).mockResolvedValue(mockMessage);
		(getOrCreateCustomer as any).mockResolvedValue({
			id: 'customer_123',
			email: 'test@example.com',
		});
		(createTicket as any).mockResolvedValue({
			id: 'ticket_123',
			friendlyId: 'TICK-456',
		});
		(bindTicketWithThread as any).mockResolvedValue(undefined);
		(getBotFooter as any).mockReturnValue('Bot Footer');
	});

	describe('Event Configuration', () => {
		it('should export correct event name', () => {
			expect(name).toBe(Events.ThreadCreate);
		});
	});

	describe('Forum Channel Validation', () => {
		it('should skip processing for non-validated forum channels', async () => {
			(isValidatedForumChannel as any).mockResolvedValue(false);

			await execute(mockThread as ThreadChannel);

			expect(isValidatedForumChannel).toHaveBeenCalledWith('forum_channel_123');
			expect(fetchStarterMessage).not.toHaveBeenCalled();
		});

		it('should handle forum channel validation errors', async () => {
			const validationError = new Error('Validation failed');
			(isValidatedForumChannel as any).mockRejectedValue(validationError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith('Error validating forum channel:', 'Validation failed');
			expect(LogEngine.error).toHaveBeenCalledWith('Thread: "Help with Account Issues" (thread_123) in Guild: Test Guild (guild_123)');
			expect(LogEngine.error).toHaveBeenCalledWith('Skipping thread processing due to validation error');
		});

		it('should process threads in validated forum channels', async () => {
			await execute(mockThread as ThreadChannel);

			expect(isValidatedForumChannel).toHaveBeenCalledWith('forum_channel_123');
			expect(LogEngine.info).toHaveBeenCalledWith('New forum post detected in monitored channel: Help with Account Issues');
		});
	});

	describe('Permission Checking', () => {
		it('should skip processing when bot member not found', async () => {
			mockThread.guild!.members.me = null;

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith('Bot member not found in guild');
			expect(fetchStarterMessage).not.toHaveBeenCalled();
		});

		it('should skip processing when parent channel not found', async () => {
			mockThread.parent = null;

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith('Parent channel not found for thread');
			expect(fetchStarterMessage).not.toHaveBeenCalled();
		});

		it('should check required permissions in parent channel', async () => {
			await execute(mockThread as ThreadChannel);

			expect(mockBotMember.permissionsIn).toHaveBeenCalledWith(mockThread.parent);
			expect(mockPermissions.has).toHaveBeenCalledWith([
				PermissionFlagsBits.SendMessagesInThreads,
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.ReadMessageHistory,
				PermissionFlagsBits.SendMessages,
			]);
		});

		it('should skip processing when missing parent channel permissions', async () => {
			mockPermissions.has.mockReturnValue(false);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Cannot create support tickets in forum channel "support-forum" (forum_channel_123)'
			);
			// The exact message depends on how the mock behaves, but should include the permission names
			expect(LogEngine.error).toHaveBeenCalledWith(
				expect.stringContaining('Missing permissions:')
			);
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Action required: Ask a server administrator to grant the bot these permissions in the forum channel.'
			);
			expect(LogEngine.error).toHaveBeenCalledWith('Guild: Test Guild (guild_123)');
		});

		it('should check thread-specific permissions', async () => {
			await execute(mockThread as ThreadChannel);

			// Should check permissions both in parent and in thread
			expect(mockBotMember.permissionsIn).toHaveBeenCalledWith(mockThread.parent);
			expect(mockBotMember.permissionsIn).toHaveBeenCalledWith(mockThread);
		});

		it('should skip processing when missing thread permissions', async () => {
			// Mock parent permissions as OK, but thread permissions as missing
			mockBotMember.permissionsIn.mockImplementation((channel: any) => {
				if (channel === mockThread.parent) {
					return { has: vi.fn().mockReturnValue(true) };
				}
				return { has: vi.fn().mockReturnValue(false) };
			});

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Cannot process forum thread "Help with Account Issues" (thread_123)'
			);
			expect(LogEngine.error).toHaveBeenCalledWith(
				expect.stringContaining('Missing thread permissions:')
			);
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Action required: Ask a server administrator to grant the bot these permissions for forum threads.'
			);
			expect(LogEngine.error).toHaveBeenCalledWith('Guild: Test Guild (guild_123)');
		});
	});

	describe('Ticket Creation Workflow', () => {
		it('should fetch starter message', async () => {
			await execute(mockThread as ThreadChannel);

			expect(withRetry).toHaveBeenCalled();
			expect(fetchStarterMessage).toHaveBeenCalledWith(mockThread);
		});

		it('should handle missing starter message', async () => {
			(fetchStarterMessage as any).mockResolvedValue(null);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				'No starter message found in thread'
			);
		});

		it('should handle missing message author', async () => {
			mockMessage.author = null;
			(fetchStarterMessage as any).mockResolvedValue(mockMessage);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				expect.stringContaining('Cannot read properties')
			);
		});

		it('should generate fallback email for Discord users', async () => {
			await execute(mockThread as ThreadChannel);

			expect(LogEngine.info).toHaveBeenCalledWith(
				'Permission check passed for forum thread "Help with Account Issues" in channel "support-forum"'
			);
			expect(getOrCreateCustomer).toHaveBeenCalledWith(
				mockMessage.author,
				'user_123@discord.invalid'
			);
		});

		it('should create customer using customerUtils', async () => {
			await execute(mockThread as ThreadChannel);

			expect(getOrCreateCustomer).toHaveBeenCalledWith(
				mockMessage.author,
				'user_123@discord.invalid'
			);
		});

		it('should create ticket with correct parameters', async () => {
			await execute(mockThread as ThreadChannel);

			expect(createTicket).toHaveBeenCalledWith(
				mockMessage.author,
				'Help with Account Issues',
				'This is a support request for help with my account.',
				'test@example.com'
			);
		});

		it('should use fallback email when customer email is not available', async () => {
			(getOrCreateCustomer as any).mockResolvedValue({
				id: 'customer_123',
				email: null,
			});

			await execute(mockThread as ThreadChannel);

			expect(createTicket).toHaveBeenCalledWith(
				mockMessage.author,
				'Help with Account Issues',
				'This is a support request for help with my account.',
				'user_123@discord.invalid'
			);
		});

		it('should bind ticket with thread', async () => {
			await execute(mockThread as ThreadChannel);

			expect(bindTicketWithThread).toHaveBeenCalledWith('ticket_123', 'thread_123');
		});

		it('should send confirmation embed to thread', async () => {
			await execute(mockThread as ThreadChannel);

			expect(mockThread.send).toHaveBeenCalledWith({
				embeds: [expect.any(Object)],
			});
		});

		it('should log successful ticket creation', async () => {
			await execute(mockThread as ThreadChannel);

			expect(LogEngine.info).toHaveBeenCalledWith('Forum post converted to ticket: #TICK-456');
		});
	});

	describe('Error Handling', () => {
		it('should handle timeout errors specifically', async () => {
			const timeoutError = new Error('Request timeout occurred');
			(createTicket as any).mockRejectedValue(timeoutError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Ticket creation is taking longer than expected. Please wait and try again.'
			);
		});

		it('should handle general errors', async () => {
			const generalError = new Error('Something went wrong');
			(createTicket as any).mockRejectedValue(generalError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				'Something went wrong'
			);
		});

		it('should handle non-Error objects', async () => {
			const stringError = 'String error';
			(createTicket as any).mockRejectedValue(stringError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				'String error'
			);
		});

		it('should send error embed when ticket creation fails and bot has permissions', async () => {
			const error = new Error('Ticket creation failed');
			(createTicket as any).mockRejectedValue(error);

			await execute(mockThread as ThreadChannel);

			expect(mockThread.send).toHaveBeenCalledWith({
				embeds: [expect.any(Object)],
			});
		});

	it('should not send error embed when bot lacks permissions', async () => {
		const error = new Error('Ticket creation failed');
		(createTicket as any).mockRejectedValue(error);

		// Simulate missing thread permissions
		mockBotMember.permissionsIn.mockReturnValue({ has: vi.fn().mockReturnValue(false) });

		await execute(mockThread as ThreadChannel);

		// Assert no attempt to send an embed due to missing perms
		expect(mockThread.send).not.toHaveBeenCalled();
		expect(LogEngine.error).toHaveBeenCalledWith(
			'An error occurred while creating the ticket:',
			'Ticket creation failed'
		);
	});

		it('should handle errors in error message sending', async () => {
			const ticketError = new Error('Ticket creation failed');
			const sendError = new Error('Failed to send message');
			(createTicket as any).mockRejectedValue(ticketError);
			(mockThread.send as any).mockRejectedValue(sendError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Could not send error message to thread:',
				'Failed to send message'
			);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty thread name', async () => {
			mockThread.name = '';

			await execute(mockThread as ThreadChannel);

			expect(createTicket).toHaveBeenCalledWith(
				mockMessage.author,
				'',
				'This is a support request for help with my account.',
				'test@example.com'
			);
		});

		it('should handle empty message content', async () => {
			mockMessage.content = '';
			(fetchStarterMessage as any).mockResolvedValue(mockMessage);

			await execute(mockThread as ThreadChannel);

			expect(createTicket).toHaveBeenCalledWith(
				mockMessage.author,
				'Help with Account Issues',
				'',
				'test@example.com'
			);
		});

		it('should handle missing parent ID', async () => {
			mockThread.parentId = null;

			await execute(mockThread as ThreadChannel);

			expect(isValidatedForumChannel).toHaveBeenCalledWith('');
		});
	});

	describe('Integration Testing', () => {
		it('should complete full workflow successfully', async () => {
			await execute(mockThread as ThreadChannel);

			// Verify the complete workflow
			expect(isValidatedForumChannel).toHaveBeenCalled();
			expect(fetchStarterMessage).toHaveBeenCalled();
			expect(getOrCreateCustomer).toHaveBeenCalled();
			expect(createTicket).toHaveBeenCalled();
			expect(bindTicketWithThread).toHaveBeenCalled();
			expect(mockThread.send).toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith('Forum post converted to ticket: #TICK-456');
		});

		it('should handle customer creation failure gracefully', async () => {
			const customerError = new Error('Customer creation failed');
			(getOrCreateCustomer as any).mockRejectedValue(customerError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				'Customer creation failed'
			);
		});

		it('should handle thread binding failure gracefully', async () => {
			const bindError = new Error('Binding failed');
			(bindTicketWithThread as any).mockRejectedValue(bindError);

			await execute(mockThread as ThreadChannel);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'An error occurred while creating the ticket:',
				'Binding failed'
			);
		});
	});

	describe('Module Structure', () => {
		it('should export required properties', () => {
			expect(name).toBeDefined();
			expect(execute).toBeDefined();
			expect(typeof execute).toBe('function');
		});

		it('should have async execute function', () => {
			expect(execute.constructor.name).toBe('AsyncFunction');
		});
	});
});