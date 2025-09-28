/**
 * Test Suite: Support Command
 *
 * Comprehensive tests for the support command module.
 * Tests cover command structure, execution logic, validation, modal creation,
 * and error handling scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	TextInputStyle,
	PermissionFlagsBits,
	ChatInputCommandInteraction,
	GuildMember,
	TextChannel,
	ChannelType,
} from 'discord.js';
import supportCommand from '../../../commands/support/support';

// Mock the channel utils
vi.mock('../../../utils/channelUtils', () => ({
	default: {
		isValidatedForumChannel: vi.fn(),
	},
}));

describe('Support Command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockGuild: any;
	let mockChannel: Partial<TextChannel>;
	let mockMember: Partial<GuildMember>;
	let mockBotMember: Partial<GuildMember>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock guild
		mockGuild = {
			id: 'test_guild_id',
			name: 'Test Guild',
			members: {
				me: null, // Will be set in individual tests
			},
		};

		// Create mock channel
		mockChannel = {
			id: 'test_channel_id',
			type: ChannelType.GuildText,
			isThread: vi.fn().mockReturnValue(false),
		};

		// Create mock member
		mockMember = {
			id: 'test_user_id',
			user: {
				id: 'test_user_id',
				username: 'testuser',
			},
		};

		// Create mock bot member with permissions
		mockBotMember = {
			id: 'test_bot_id',
			permissionsIn: vi.fn().mockReturnValue({
				has: vi.fn().mockReturnValue(true),
			}),
		};

		// Create mock interaction
		mockInteraction = {
			inGuild: vi.fn().mockReturnValue(true),
			channel: mockChannel as TextChannel,
			guild: mockGuild,
			member: mockMember as GuildMember,
			user: {
				id: 'test_user_id',
				username: 'testuser',
			},
			reply: vi.fn().mockResolvedValue(undefined),
			showModal: vi.fn().mockResolvedValue(undefined),
		};

		// Set bot member in guild
		mockGuild.members.me = mockBotMember;
	});

	describe('Command Structure', () => {
		it('should have correct command data structure', () => {
			// Check that supportCommand.data has the correct properties instead of instanceof
			expect(supportCommand.data.name).toBe('support');
			expect(supportCommand.data.description).toBe('Open a support ticket');
			expect(typeof supportCommand.data.setName).toBe('function');
			expect(typeof supportCommand.data.setDescription).toBe('function');
		});

		it('should have execute function', () => {
			expect(typeof supportCommand.execute).toBe('function');
		});
	});

	describe('Guild and Channel Validation', () => {
		it('should reject execution outside of guild', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: '❌ **Cannot use `/support` here**\n\nPlease run this command inside a server text channel.',
				ephemeral: true,
			});
		});

		it('should reject execution without channel', async () => {
			mockInteraction.channel = null;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: '❌ **Cannot use `/support` here**\n\nPlease run this command inside a server text channel.',
				ephemeral: true,
			});
		});

		it('should reject execution in threads', async () => {
			mockChannel.isThread = vi.fn().mockReturnValue(true);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: '❌ **Cannot use `/support` command in threads**\n\nThe `/support` command can only be used in text channels. Please use `/support` in the main channel instead of inside threads or forum posts.',
				ephemeral: true,
			});
		});
	});

	describe('Forum Channel Validation', () => {
		it('should reject execution in configured forum channels', async () => {
			// Mock channelUtils to return true for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(true);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: '❌ **Cannot use `/support` command here**\n\nThis channel is configured for forum-based tickets. Please create a new forum post instead of using the `/support` command.',
				ephemeral: true,
			});
		});

		it('should proceed when channel is not a configured forum channel', async () => {
			// Mock channelUtils to return false for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.showModal).toHaveBeenCalled();
		});
	});

	describe('Permission Validation', () => {
		it('should reject execution when bot lacks required permissions', async () => {
			// Mock channelUtils to return false for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			// Mock bot member to lack permissions
			mockBotMember.permissionsIn = vi.fn().mockReturnValue({
				has: vi.fn().mockReturnValue(false),
			});

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: `❌ **Cannot create support tickets here**

Missing permissions: **Manage Threads**, **Create Private Threads**, **Send Messages**, **Send Messages in Threads**, **View Channel**

Ask an admin to grant these permissions or use \`/support\` in an authorized channel.`,
				ephemeral: true,
			});
		});

		it('should check for specific required permissions', async () => {
			// Mock channelUtils to return false for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			const mockPermissionsIn = vi.fn().mockReturnValue({
				has: vi.fn().mockReturnValue(true),
			});
			mockBotMember.permissionsIn = mockPermissionsIn;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockPermissionsIn).toHaveBeenCalledWith(mockChannel);
			expect(mockPermissionsIn().has).toHaveBeenCalledWith([
				PermissionFlagsBits.ManageThreads,
				PermissionFlagsBits.CreatePrivateThreads,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.SendMessagesInThreads,
				PermissionFlagsBits.ViewChannel,
			]);
		});

		it('should handle missing guild gracefully', async () => {
			// Mock channelUtils to return false for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			mockInteraction.guild = null;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: `❌ **Cannot create support tickets here**

Missing permissions: **Manage Threads**, **Create Private Threads**, **Send Messages**, **Send Messages in Threads**, **View Channel**

Ask an admin to grant these permissions or use \`/support\` in an authorized channel.`,
				ephemeral: true,
			});
		});

		it('should handle missing bot member gracefully', async () => {
			// Mock channelUtils to return false for forum channel
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			mockGuild.members.me = null;

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: `❌ **Cannot create support tickets here**

Missing permissions: **Manage Threads**, **Create Private Threads**, **Send Messages**, **Send Messages in Threads**, **View Channel**

Ask an admin to grant these permissions or use \`/support\` in an authorized channel.`,
				ephemeral: true,
			});
		});
	});

	describe('Modal Creation and Presentation', () => {
		beforeEach(async () => {
			// Setup successful validation path
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);
		});

		it('should create and present modal on successful validation', async () => {
			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.showModal).toHaveBeenCalled();
			const modalCall = vi.mocked(mockInteraction.showModal).mock.calls[0];
			const modal = modalCall[0];

			// Check that modal has the correct properties instead of instanceof
			expect(modal.data.custom_id).toBe('supportModal');
			expect(modal.data.title).toBe('Support Ticket');
		});

		it('should create modal with correct structure', async () => {
			// Capture the modal passed to showModal
			const showModalSpy = vi.mocked(mockInteraction.showModal);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(showModalSpy).toHaveBeenCalledTimes(1);
			const modalCall = showModalSpy.mock.calls[0];
			const modal = modalCall[0];

			// Check modal basic properties
			expect(modal.data.custom_id).toBe('supportModal');
			expect(modal.data.title).toBe('Support Ticket');

			// Check that modal has components (action rows)
			expect(modal.data.components).toHaveLength(3);

			// Verify each action row has the expected text input
			const firstRow = modal.data.components![0];
			const secondRow = modal.data.components![1];
			const thirdRow = modal.data.components![2];

			// Access the data structure properly
			expect(firstRow.data.components).toHaveLength(1);
			expect(secondRow.data.components).toHaveLength(1);
			expect(thirdRow.data.components).toHaveLength(1);

			// Check title input
			const titleInput = firstRow.data.components[0].data;
			expect(titleInput.custom_id).toBe('titleInput');
			expect(titleInput.label).toBe('Ticket Title');
			expect(titleInput.style).toBe(TextInputStyle.Short);
			expect(titleInput.required).toBe(true);
			expect(titleInput.min_length).toBe(5);
			expect(titleInput.max_length).toBe(100);

			// Check issue input
			const issueInput = secondRow.data.components[0].data;
			expect(issueInput.custom_id).toBe('issueInput');
			expect(issueInput.label).toBe('Summary');
			expect(issueInput.style).toBe(TextInputStyle.Paragraph);
			expect(issueInput.required).toBe(true);
			expect(issueInput.max_length).toBe(2000);

			// Check email input
			const emailInput = thirdRow.data.components[0].data;
			expect(emailInput.custom_id).toBe('emailInput');
			expect(emailInput.label).toBe('Contact Email (Optional)');
			expect(emailInput.style).toBe(TextInputStyle.Short);
			expect(emailInput.required).toBe(false);
			expect(emailInput.max_length).toBe(254);
		});
	});

	describe('Integration with Channel Utils', () => {
		it('should call isValidatedForumChannel with correct channel ID', async () => {
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			await supportCommand.execute(mockInteraction as ChatInputCommandInteraction);

			expect(channelUtils.default.isValidatedForumChannel).toHaveBeenCalledWith('test_channel_id');
		});

		it('should handle channel utils errors gracefully', async () => {
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockRejectedValue(new Error('Channel utils error'));

			// The command should throw when channel utils fails
			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Channel utils error');
		});
	});

	describe('Error Scenarios', () => {
		it('should handle interaction reply failures', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);
			mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Reply failed'));

			// Should throw when reply fails
			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Reply failed');
		});

		it('should handle modal presentation failures', async () => {
			const channelUtils = await import('../../../utils/channelUtils');
			vi.mocked(channelUtils.default.isValidatedForumChannel).mockResolvedValue(false);

			mockInteraction.showModal = vi.fn().mockRejectedValue(new Error('Modal failed'));

			// Should throw when showModal fails
			await expect(supportCommand.execute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Modal failed');
		});
	});
});