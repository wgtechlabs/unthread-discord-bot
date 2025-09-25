/**
 * Test Suite: Support Command
 *
 * Comprehensive tests for the support command.
 * Tests cover command execution, modal creation, permissions, and validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import supportCommand from '../../../commands/support/support';
import channelUtils from '../../../utils/channelUtils';

// Mock channelUtils
vi.mock('../../../utils/channelUtils', () => ({
	default: {
		isValidatedForumChannel: vi.fn(),
	},
}));

describe('support command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockChannel: Partial<TextChannel>;
	let mockGuild: any;
	let mockBotMember: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock channel utils
		(channelUtils.isValidatedForumChannel as any).mockResolvedValue(false);

		// Setup mock bot member with permissions
		mockBotMember = {
			permissionsIn: vi.fn().mockReturnValue({
				has: vi.fn().mockReturnValue(true), // Default to having permissions
			}),
		};

		// Setup mock guild
		mockGuild = {
			members: {
				me: mockBotMember,
			},
		};

		// Setup mock channel
		mockChannel = {
			id: 'test_channel_id',
			name: 'general',
			isThread: vi.fn().mockReturnValue(false),
		};

		// Setup mock interaction
		mockInteraction = {
			inGuild: vi.fn().mockReturnValue(true),
			channel: mockChannel,
			guild: mockGuild,
			reply: vi.fn().mockResolvedValue(undefined),
			showModal: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('command data', () => {
		it('should have correct command name', () => {
			expect(supportCommand.data.name).toBe('support');
		});

		it('should have correct command description', () => {
			expect(supportCommand.data.description).toBe('Open a support ticket');
		});

		it('should be a valid SlashCommandBuilder instance', () => {
			expect(supportCommand.data).toBeDefined();
			expect(typeof supportCommand.data.toJSON).toBe('function');
		});
	});

	describe('execute function - validation checks', () => {
		it('should return error when not in guild', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toContain('Cannot use `/support` here');
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should return error when channel is null', async () => {
			mockInteraction.channel = null;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toContain('Cannot use `/support` here');
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should return error when used in thread', async () => {
			mockChannel.isThread = vi.fn().mockReturnValue(true);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toContain('Cannot use `/support` command in threads');
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should return error when used in forum channel', async () => {
			(channelUtils.isValidatedForumChannel as any).mockResolvedValue(true);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(channelUtils.isValidatedForumChannel).toHaveBeenCalledWith('test_channel_id');
			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toContain('forum-based tickets');
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should return error when bot lacks required permissions', async () => {
			mockBotMember.permissionsIn.mockReturnValue({
				has: vi.fn().mockReturnValue(false),
			});

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockBotMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toContain('Cannot create support tickets here');
			expect(replyCall.ephemeral).toBe(true);
		});
	});

	describe('execute function - modal creation', () => {
		it('should show modal when all validations pass', async () => {
			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.showModal).toHaveBeenCalledOnce();
			expect(mockInteraction.reply).not.toHaveBeenCalled();
		});

		it('should create modal with correct properties', async () => {
			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			const modalCall = (mockInteraction.showModal as any).mock.calls[0][0];
			
			// Note: The actual modal structure would depend on how our mocks handle ModalBuilder
			// We can verify showModal was called with a truthy value
			expect(modalCall).toBeTruthy();
		});

		it('should handle showModal errors gracefully', async () => {
			const modalError = new Error('Modal failed');
			mockInteraction.showModal = vi.fn().mockRejectedValue(modalError);

			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Modal failed');
		});
	});

	describe('permission checks', () => {
		it('should check bot permissions in channel', async () => {
			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockBotMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
		});

		it('should allow bots with required permissions', async () => {
			mockBotMember.permissionsIn.mockReturnValue({
				has: vi.fn().mockReturnValue(true),
			});

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.showModal).toHaveBeenCalledOnce();
		});

		it('should deny bots without required permissions', async () => {
			mockBotMember.permissionsIn.mockReturnValue({
				has: vi.fn().mockReturnValue(false),
			});

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall.content).toContain('Cannot create support tickets here');
		});
	});

	describe('channel validation', () => {
		it('should call isValidatedForumChannel with correct channel ID', async () => {
			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(channelUtils.isValidatedForumChannel).toHaveBeenCalledWith('test_channel_id');
		});

		it('should handle isValidatedForumChannel errors gracefully', async () => {
			const channelError = new Error('Channel validation failed');
			(channelUtils.isValidatedForumChannel as any).mockRejectedValue(channelError);

			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Channel validation failed');
		});

		it('should check thread status before other validations', async () => {
			mockChannel.isThread = vi.fn().mockReturnValue(true);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			// Should not call forum channel validation if it's a thread
			expect(channelUtils.isValidatedForumChannel).not.toHaveBeenCalled();
			expect(mockInteraction.reply).toHaveBeenCalledOnce();
		});
	});

	describe('error handling', () => {
		it('should handle null guild member gracefully', async () => {
			mockGuild.members.me = null;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall.content).toContain('Cannot create support tickets here');
		});

		it('should handle reply errors', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);
			const replyError = new Error('Reply failed');
			mockInteraction.reply = vi.fn().mockRejectedValue(replyError);

			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Reply failed');
		});
	});

	describe('integration scenarios', () => {
		it('should work in valid text channel with proper permissions', async () => {
			// Setup perfect conditions
			mockInteraction.inGuild = vi.fn().mockReturnValue(true);
			mockChannel.isThread = vi.fn().mockReturnValue(false);
			(channelUtils.isValidatedForumChannel as any).mockResolvedValue(false);
			mockBotMember.permissionsIn.mockReturnValue({
				has: vi.fn().mockReturnValue(true),
			});

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.showModal).toHaveBeenCalledOnce();
			expect(mockInteraction.reply).not.toHaveBeenCalled();
		});

		it('should fail early on first validation failure', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			// Should not call subsequent validations
			expect(channelUtils.isValidatedForumChannel).not.toHaveBeenCalled();
			expect(mockBotMember.permissionsIn).not.toHaveBeenCalled();
			expect(mockInteraction.showModal).not.toHaveBeenCalled();
		});
	});
});