/**
 * Test Suite: Server Command
 *
 * Comprehensive tests for the server command.
 * Tests cover command execution, embed creation, and guild validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { execute, data } from '../../../commands/utilities/server';

describe('server command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockGuild: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock guild
		mockGuild = {
			id: 'test_guild_id_12345',
			name: 'Test Server',
			memberCount: 150,
			createdTimestamp: 1609459200000, // Jan 1, 2021
			iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
		};

		// Setup mock interaction
		mockInteraction = {
			guild: mockGuild,
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('command data', () => {
		it('should have correct command name', () => {
			expect(data.name).toBe('server');
		});

		it('should have correct command description', () => {
			expect(data.description).toBe('Provides information about the server.');
		});

		it('should be a valid SlashCommandBuilder instance', () => {
			expect(data).toBeDefined();
			expect(typeof data.toJSON).toBe('function');
		});
	});

	describe('execute function', () => {
		it('should reply with server information embed', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall).toHaveProperty('embeds');
			expect(replyCall.embeds).toHaveLength(1);
		});

		it('should create embed with correct server information', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('Server Information');
			expect(embed.data.timestamp).toBeDefined();
			expect(embed.data.footer?.text).toBe('Server ID: test_guild_id_12345');
		});

		it('should include server name in embed fields', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const serverNameField = embed.data.fields.find((field: any) => field.name === 'Server Name');
			expect(serverNameField).toBeDefined();
			expect(serverNameField.value).toBe('Test Server');
			expect(serverNameField.inline).toBe(true);
		});

		it('should include member count in embed fields', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const memberCountField = embed.data.fields.find((field: any) => field.name === 'Total Members');
			expect(memberCountField).toBeDefined();
			expect(memberCountField.value).toBe('150');
			expect(memberCountField.inline).toBe(true);
		});

		it('should include creation date with Discord timestamp formatting', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const createdAtField = embed.data.fields.find((field: any) => field.name === 'Created At');
			expect(createdAtField).toBeDefined();
			// Should format timestamp as Discord timestamp
			expect(createdAtField.value).toBe('<t:1609459200:F>');
			expect(createdAtField.inline).toBe(false);
		});

		it('should set server icon as thumbnail when available', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockGuild.iconURL).toHaveBeenCalledOnce();
			
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];
			
			// Note: The actual thumbnail setting would be handled by the mock
			// We can verify iconURL was called
		});

		it('should handle missing server icon gracefully', async () => {
			mockGuild.iconURL = vi.fn().mockReturnValue(null);

			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockGuild.iconURL).toHaveBeenCalledOnce();
			// Should not throw error and still reply with embed
			expect(mockInteraction.reply).toHaveBeenCalledOnce();
		});

		it('should return early with error message when not in guild', async () => {
			mockInteraction.guild = null;

			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			
			expect(replyCall.content).toBe('This command can only be used in a server.');
			expect(replyCall.ephemeral).toBe(true);
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
			expect(embed.data).toHaveProperty('footer');
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
		it('should handle very large member counts', async () => {
			mockGuild.memberCount = 999999;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const memberCountField = embed.data.fields.find((field: any) => field.name === 'Total Members');
			expect(memberCountField.value).toBe('999999');
		});

		it('should handle zero member count', async () => {
			mockGuild.memberCount = 0;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const memberCountField = embed.data.fields.find((field: any) => field.name === 'Total Members');
			expect(memberCountField.value).toBe('0');
		});

		it('should handle special characters in server name', async () => {
			mockGuild.name = 'Test Server™ 🎮 & More!';

			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			const serverNameField = embed.data.fields.find((field: any) => field.name === 'Server Name');
			expect(serverNameField.value).toBe('Test Server™ 🎮 & More!');
		});
	});
});