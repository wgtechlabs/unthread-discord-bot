/**
 * Test Suite: Server Command
 *
 * Comprehensive tests for the server command module.
 * Tests cover command structure, guild information retrieval, embed formatting,
 * timestamp handling, and error scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Guild } from 'discord.js';
import { data as serverData, execute as serverExecute } from '../../../commands/utilities/server';

describe('Server Command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockGuild: Partial<Guild>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock guild
		mockGuild = {
			id: 'test_guild_id_12345',
			name: 'Test Server Name',
			memberCount: 150,
			createdTimestamp: 1640995200000, // Mock creation timestamp
			iconURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/icons/test_guild_id/test_icon.png'),
		};

		// Create mock interaction
		mockInteraction = {
			guild: mockGuild as Guild,
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('Command Structure', () => {
		it('should have correct command data structure', () => {
			// Check that serverData has the correct properties instead of instanceof
			expect(serverData.name).toBe('server');
			expect(serverData.description).toBe('Provides information about the server.');
			expect(typeof serverData.setName).toBe('function');
			expect(typeof serverData.setDescription).toBe('function');
		});

		it('should export execute function', () => {
			expect(typeof serverExecute).toBe('function');
		});
	});

	describe('Guild Information Retrieval', () => {
		it('should display server information when guild is available', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							title: 'Server Information',
							color: 0xEB1A1A,
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Server Name',
									value: 'Test Server Name',
									inline: true,
								}),
								expect.objectContaining({
									name: 'Total Members',
									value: '150',
									inline: true,
								}),
								expect.objectContaining({
									name: 'Created At',
									value: expect.stringMatching(/<t:\d+:F>/),
									inline: false,
								}),
							]),
							footer: expect.objectContaining({
								text: 'Server ID: test_guild_id_12345',
							}),
							timestamp: expect.any(String),
						}),
					}),
				]),
			});
		});

		it('should handle server with zero members', async () => {
			mockGuild.memberCount = 0;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Total Members',
									value: '0',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle server with large member count', async () => {
			mockGuild.memberCount = 999999;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Total Members',
									value: '999999',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle undefined member count', async () => {
			mockGuild.memberCount = undefined;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Total Members',
									value: 'undefined',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});
	});

	describe('Non-Guild Execution Handling', () => {
		it('should reject execution when guild is null', async () => {
			mockInteraction.guild = null;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: 'This command can only be used in a server.',
				ephemeral: true,
			});
		});

		it('should reject execution when guild is undefined', async () => {
			mockInteraction.guild = undefined;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: 'This command can only be used in a server.',
				ephemeral: true,
			});
		});

		it('should not call embed creation when guild is missing', async () => {
			mockInteraction.guild = null;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			// Should not attempt to access guild properties
			expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
			expect(mockInteraction.reply).not.toHaveBeenCalledWith({
				embeds: expect.any(Array),
			});
		});
	});

	describe('Embed Structure and Content', () => {
		it('should create embed with correct color', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.color).toBe(0xEB1A1A);
		});

		it('should create embed with correct title', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.title).toBe('Server Information');
		});

		it('should include server ID in footer', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.footer?.text).toBe('Server ID: test_guild_id_12345');
		});

		it('should include timestamp', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should have three fields with correct structure', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const fields = embed.data.fields!;

			expect(fields).toHaveLength(3);

			// Server Name field
			expect(fields[0]).toEqual({
				name: 'Server Name',
				value: 'Test Server Name',
				inline: true,
			});

			// Total Members field
			expect(fields[1]).toEqual({
				name: 'Total Members',
				value: '150',
				inline: true,
			});

			// Created At field
			expect(fields[2]).toEqual({
				name: 'Created At',
				value: expect.stringMatching(/<t:\d+:F>/),
				inline: false,
			});
		});
	});

	describe('Timestamp Conversion Accuracy', () => {
		it('should convert timestamp to Discord format correctly', async () => {
			const testTimestamp = 1640995200000; // Known timestamp
			mockGuild.createdTimestamp = testTimestamp;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(testTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdAtField = embed.data.fields!.find(field => field.name === 'Created At');

			expect(createdAtField?.value).toBe(expectedDiscordTimestamp);
		});

		it('should handle very old timestamps', async () => {
			const oldTimestamp = 946684800000; // Year 2000
			mockGuild.createdTimestamp = oldTimestamp;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(oldTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdAtField = embed.data.fields!.find(field => field.name === 'Created At');

			expect(createdAtField?.value).toBe(expectedDiscordTimestamp);
		});

		it('should handle recent timestamps', async () => {
			const recentTimestamp = Date.now();
			mockGuild.createdTimestamp = recentTimestamp;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(recentTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdAtField = embed.data.fields!.find(field => field.name === 'Created At');

			expect(createdAtField?.value).toBe(expectedDiscordTimestamp);
		});
	});

	describe('Server Icon Handling', () => {
		it('should set thumbnail when server has icon', async () => {
			const iconUrl = 'https://cdn.discordapp.com/icons/test_guild_id/test_icon.png';
			mockGuild.iconURL = vi.fn().mockReturnValue(iconUrl);

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockGuild.iconURL).toHaveBeenCalled();

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.thumbnail?.url).toBe(iconUrl);
		});

		it('should not set thumbnail when server has no icon', async () => {
			mockGuild.iconURL = vi.fn().mockReturnValue(null);

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockGuild.iconURL).toHaveBeenCalled();

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.thumbnail).toBeUndefined();
		});

		it('should handle iconURL method returning undefined', async () => {
			mockGuild.iconURL = vi.fn().mockReturnValue(undefined);

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.thumbnail).toBeUndefined();
		});
	});

	describe('Error Scenarios', () => {
		it('should handle reply failure gracefully', async () => {
			mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Reply failed'));

			await expect(serverExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Reply failed');
		});

		it('should handle missing guild properties gracefully', async () => {
			// Remove properties one by one
			mockGuild.name = undefined as any;
			mockGuild.memberCount = undefined;
			mockGuild.id = undefined as any;
			mockGuild.createdTimestamp = undefined as any;

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			// Should still create embed, just with undefined values
			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Server Name',
									value: undefined,
								}),
								expect.objectContaining({
									name: 'Total Members',
									value: 'undefined',
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle iconURL method throwing error', async () => {
			mockGuild.iconURL = vi.fn().mockImplementation(() => {
				throw new Error('Icon URL error');
			});

			// The command will throw an error when accessing iconURL
			await expect(serverExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Icon URL error');
		});
	});

	describe('Guild Property Access', () => {
		it('should access all required guild properties', async () => {
			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			// Verify that the command accessed the expected guild properties
			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];

			// Check that guild properties were used
			expect(embed.data.fields!.some(field => 
				field.name === 'Server Name' && field.value === mockGuild.name
			)).toBe(true);

			expect(embed.data.fields!.some(field => 
				field.name === 'Total Members' && field.value === `${mockGuild.memberCount}`
			)).toBe(true);

			expect(embed.data.footer?.text).toContain(mockGuild.id);
		});

		it('should handle special characters in server name', async () => {
			mockGuild.name = 'Test Server 🎮 [GAMING] & More!';

			await serverExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const serverNameField = embed.data.fields!.find(field => field.name === 'Server Name');

			expect(serverNameField?.value).toBe('Test Server 🎮 [GAMING] & More!');
		});
	});
});