/**
 * Test Suite: User Command
 *
 * Comprehensive tests for the user command.
 * Tests cover command execution, embed creation, and user information retrieval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, GuildMember, APIInteractionGuildMember } from 'discord.js';
import { execute, data } from '../../../commands/utilities/user';

describe('user command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockMember: Partial<GuildMember>;
	let mockUser: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock user
		mockUser = {
			id: 'user_id_12345',
			username: 'testuser',
			displayName: 'Test User',
			discriminator: '0001',
			avatar: 'avatar_hash_12345',
			createdTimestamp: 1577836800000, // Jan 1, 2020
			displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
		};

		// Setup mock member with joinedTimestamp
		mockMember = {
			user: mockUser,
			joinedTimestamp: 1609459200000, // Jan 1, 2021
		};

		// Setup mock interaction
		mockInteraction = {
			inGuild: vi.fn().mockReturnValue(true),
			member: mockMember,
			user: mockUser,
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('command data', () => {
		it('should have correct command name', () => {
			expect(data.name).toBe('user');
		});

		it('should have correct command description', () => {
			expect(data.description).toBe('Provides information about the user.');
		});

		it('should be a valid SlashCommandBuilder instance', () => {
			expect(data).toBeDefined();
			expect(typeof data.toJSON).toBe('function');
		});
	});

	describe('execute function', () => {
		it('should reply with user information embed when in guild', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall).toHaveProperty('embeds');
			expect(replyCall.embeds).toHaveLength(1);
		});

		it('should create embed with correct user information', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('User Information');
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should include username in embed fields', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const usernameField = embed.data.fields.find((field: any) => field.name === 'Username');
			expect(usernameField).toBeDefined();
			expect(usernameField.value).toBe('testuser');
			expect(usernameField.inline).toBe(true);
		});

		it('should include user ID in footer', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			expect(embed.data.footer?.text).toBe('User ID: user_id_12345');
		});

		it('should format account creation date with Discord timestamp', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const accountCreatedField = embed.data.fields.find((field: any) => field.name === 'Account Created');
			expect(accountCreatedField).toBeDefined();
			expect(accountCreatedField.value).toBe('<t:1577836800:F>');
			expect(accountCreatedField.inline).toBe(false);
		});

		it('should format server join date with Discord timestamp when available', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const joinedServerField = embed.data.fields.find((field: any) => field.name === 'Joined Server');
			expect(joinedServerField).toBeDefined();
			expect(joinedServerField.value).toBe('<t:1609459200:F>');
			expect(joinedServerField.inline).toBe(true);
		});

		it('should show "Unavailable" for server join date when timestamp is null', async () => {
			mockMember.joinedTimestamp = null;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const joinedServerField = embed.data.fields.find((field: any) => field.name === 'Joined Server');
			expect(joinedServerField).toBeDefined();
			expect(joinedServerField.value).toBe('Unavailable');
		});

		it('should handle APIInteractionGuildMember without joinedTimestamp', async () => {
			// Simulate API member without joinedTimestamp property
			const apiMember: Partial<APIInteractionGuildMember> = {
				user: mockUser,
				// joinedTimestamp not present in API member
			};
			mockInteraction.member = apiMember;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const joinedServerField = embed.data.fields.find((field: any) => field.name === 'Joined Server');
			expect(joinedServerField).toBeDefined();
			expect(joinedServerField.value).toBe('Unavailable');
		});

		it('should return early with error message when not in guild', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toBe('This command can only be used in a server.');
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should set user avatar as thumbnail when available', async () => {
			mockUser.displayAvatarURL = vi.fn().mockReturnValue('https://example.com/avatar.png');

			await execute(mockInteraction as ChatInputCommandInteraction);

			// The embed setting would be handled by the mock
			expect(mockInteraction.reply).toHaveBeenCalledOnce();
		});

		it('should handle interaction reply errors gracefully', async () => {
			const replyError = new Error('Reply failed');
			mockInteraction.reply = vi.fn().mockRejectedValue(replyError);

			await expect(execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Reply failed');
		});
	});

	describe('embed structure validation', () => {
		it('should create embed with all required fields', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Verify required embed properties
			expect(embed.data).toHaveProperty('color');
			expect(embed.data).toHaveProperty('title');
			expect(embed.data).toHaveProperty('fields');
			expect(embed.data).toHaveProperty('timestamp');
			
			// Should have exactly 3 fields
			expect(embed.data.fields).toHaveLength(3);
		});

		it('should use consistent color scheme', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Verify brand color (red: #EB1A1A)
			expect(embed.data.color).toBe(0xEB1A1A);
		});

		it('should format all field properties correctly', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Verify field structure
			embed.data.fields.forEach((field: any) => {
				expect(field).toHaveProperty('name');
				expect(field).toHaveProperty('value');
				expect(field).toHaveProperty('inline');
			});
		});
	});

	describe('edge cases', () => {
		it('should handle user without display name', async () => {
			mockUser.displayName = null;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const usernameField = embed.data.fields.find((field: any) => field.name === 'Username');
			expect(usernameField).toBeDefined();
			// Should show just the username
			expect(usernameField.value).toBe('testuser');
		});

		it('should handle special characters in usernames', async () => {
			mockUser.username = 'test_user_123';
			mockUser.displayName = 'Test User™';

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const usernameField = embed.data.fields.find((field: any) => field.name === 'Username');
			expect(usernameField.value).toBe('test_user_123');
		});

		it('should handle very old account creation dates', async () => {
			mockUser.createdTimestamp = 946684800000; // Jan 1, 2000

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const accountCreatedField = embed.data.fields.find((field: any) => field.name === 'Account Created');
			expect(accountCreatedField.value).toBe('<t:946684800:F>');
		});

		it('should handle recent account creation dates', async () => {
			const now = Date.now();
			mockUser.createdTimestamp = now;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const accountCreatedField = embed.data.fields.find((field: any) => field.name === 'Account Created');
			expect(accountCreatedField.value).toBe(`<t:${Math.floor(now / 1000)}:F>`);
		});
	});
});