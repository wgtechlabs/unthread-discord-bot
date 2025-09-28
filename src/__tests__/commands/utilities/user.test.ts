/**
 * Test Suite: User Command
 *
 * Comprehensive tests for the user command module.
 * Tests cover command structure, user information retrieval, member data handling,
 * timestamp calculations, avatar handling, and error scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, GuildMember, User } from 'discord.js';
import { data as userData, execute as userExecute } from '../../../commands/utilities/user';

describe('User Command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockUser: Partial<User>;
	let mockMember: Partial<GuildMember>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock user
		mockUser = {
			id: 'test_user_id_12345',
			username: 'testuser',
			displayName: 'Test User Display',
			createdTimestamp: 1640995200000, // Mock creation timestamp
			displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatars/test_user_id/test_avatar.png'),
		};

		// Create mock member
		mockMember = {
			id: 'test_user_id_12345',
			user: mockUser as User,
			joinedTimestamp: 1640995800000, // Mock join timestamp (later than creation)
		};

		// Create mock interaction
		mockInteraction = {
			inGuild: vi.fn().mockReturnValue(true),
			user: mockUser as User,
			member: mockMember as GuildMember,
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('Command Structure', () => {
		it('should have correct command data structure', () => {
			// Check that userData has the correct properties instead of instanceof
			expect(userData.name).toBe('user');
			expect(userData.description).toBe('Provides information about the user.');
			expect(typeof userData.setName).toBe('function');
			expect(typeof userData.setDescription).toBe('function');
		});

		it('should export execute function', () => {
			expect(typeof userExecute).toBe('function');
		});
	});

	describe('User Information Display', () => {
		it('should display user information when in guild', async () => {
			await userExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							title: 'User Information',
							color: 0xEB1A1A,
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Username',
									value: 'testuser',
									inline: true,
								}),
								expect.objectContaining({
									name: 'Joined Server',
									value: expect.stringMatching(/<t:\d+:F>/),
									inline: true,
								}),
								expect.objectContaining({
									name: 'Account Created',
									value: expect.stringMatching(/<t:\d+:F>/),
									inline: false,
								}),
							]),
							thumbnail: expect.objectContaining({
								url: 'https://cdn.discordapp.com/avatars/test_user_id/test_avatar.png',
							}),
							footer: expect.objectContaining({
								text: 'User ID: test_user_id_12345',
							}),
							timestamp: expect.any(String),
						}),
					}),
				]),
			});
		});

		it('should handle user without display name', async () => {
			mockUser.displayName = undefined;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const usernameField = embed.data.fields!.find(field => field.name === 'Username');

			expect(usernameField?.value).toBe('testuser');
		});

		it('should handle special characters in username', async () => {
			mockUser.username = 'test_user.123-special';

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const usernameField = embed.data.fields!.find(field => field.name === 'Username');

			expect(usernameField?.value).toBe('test_user.123-special');
		});
	});

	describe('Non-Guild Execution Handling', () => {
		it('should reject execution when not in guild', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: 'This command can only be used in a server.',
				ephemeral: true,
			});
		});

		it('should not create embed when not in guild', async () => {
			mockInteraction.inGuild = vi.fn().mockReturnValue(false);

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			// Should not attempt to create embed with user data
			expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
			expect(mockInteraction.reply).not.toHaveBeenCalledWith({
				embeds: expect.any(Array),
			});
		});
	});

	describe('Member vs User Data Handling', () => {
		it('should display join date when member has joinedTimestamp', async () => {
			const joinTimestamp = 1640995800000;
			mockMember.joinedTimestamp = joinTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(joinTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const joinedField = embed.data.fields!.find(field => field.name === 'Joined Server');

			expect(joinedField?.value).toBe(expectedDiscordTimestamp);
		});

		it('should show "Unavailable" when member has no joinedTimestamp', async () => {
			// Use a new mock member object without joinedTimestamp property
			const memberWithoutJoinTimestamp = {
				id: mockMember.id,
				user: mockUser,
				// No joinedTimestamp property
			};
			mockInteraction.member = memberWithoutJoinTimestamp as any;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const joinedField = embed.data.fields!.find(field => field.name === 'Joined Server');

			expect(joinedField?.value).toBe('Unavailable');
		});

		it('should show "Unavailable" when joinedTimestamp is null', async () => {
			mockMember.joinedTimestamp = null;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const joinedField = embed.data.fields!.find(field => field.name === 'Joined Server');

			expect(joinedField?.value).toBe('Unavailable');
		});

		it('should handle member object without joinedTimestamp property', async () => {
			// Create member-like object without joinedTimestamp
			const memberWithoutJoinTimestamp = {
				id: 'test_user_id_12345',
				user: mockUser,
				// No joinedTimestamp property
			};

			mockInteraction.member = memberWithoutJoinTimestamp as any;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const joinedField = embed.data.fields!.find(field => field.name === 'Joined Server');

			expect(joinedField?.value).toBe('Unavailable');
		});
	});

	describe('Join Date vs Creation Date', () => {
		it('should show both join date and creation date correctly', async () => {
			const createTimestamp = 1640995200000;
			const joinTimestamp = 1640995800000; // 10 minutes later

			mockUser.createdTimestamp = createTimestamp;
			mockMember.joinedTimestamp = joinTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedCreateTimestamp = `<t:${Math.floor(createTimestamp / 1000)}:F>`;
			const expectedJoinTimestamp = `<t:${Math.floor(joinTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const fields = embed.data.fields!;

			const joinedField = fields.find(field => field.name === 'Joined Server');
			const createdField = fields.find(field => field.name === 'Account Created');

			expect(joinedField?.value).toBe(expectedJoinTimestamp);
			expect(createdField?.value).toBe(expectedCreateTimestamp);
		});

		it('should handle join date before creation date (edge case)', async () => {
			const createTimestamp = 1640995800000;
			const joinTimestamp = 1640995200000; // Earlier than creation (shouldn't happen but test anyway)

			mockUser.createdTimestamp = createTimestamp;
			mockMember.joinedTimestamp = joinTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedCreateTimestamp = `<t:${Math.floor(createTimestamp / 1000)}:F>`;
			const expectedJoinTimestamp = `<t:${Math.floor(joinTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const fields = embed.data.fields!;

			const joinedField = fields.find(field => field.name === 'Joined Server');
			const createdField = fields.find(field => field.name === 'Account Created');

			expect(joinedField?.value).toBe(expectedJoinTimestamp);
			expect(createdField?.value).toBe(expectedCreateTimestamp);
		});
	});

	describe('Timestamp Calculations', () => {
		it('should convert user creation timestamp to Discord format correctly', async () => {
			const testTimestamp = 1640995200000; // Known timestamp
			mockUser.createdTimestamp = testTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(testTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdField = embed.data.fields!.find(field => field.name === 'Account Created');

			expect(createdField?.value).toBe(expectedDiscordTimestamp);
		});

		it('should handle very old user accounts', async () => {
			const oldTimestamp = 1420070400000; // Discord's launch era
			mockUser.createdTimestamp = oldTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(oldTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdField = embed.data.fields!.find(field => field.name === 'Account Created');

			expect(createdField?.value).toBe(expectedDiscordTimestamp);
		});

		it('should handle recent user accounts', async () => {
			const recentTimestamp = Date.now();
			mockUser.createdTimestamp = recentTimestamp;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedDiscordTimestamp = `<t:${Math.floor(recentTimestamp / 1000)}:F>`;

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const createdField = embed.data.fields!.find(field => field.name === 'Account Created');

			expect(createdField?.value).toBe(expectedDiscordTimestamp);
		});
	});

	describe('Avatar URL Handling', () => {
		it('should set thumbnail with user avatar', async () => {
			const avatarUrl = 'https://cdn.discordapp.com/avatars/test_user_id/test_avatar.png';
			mockUser.displayAvatarURL = vi.fn().mockReturnValue(avatarUrl);

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockUser.displayAvatarURL).toHaveBeenCalledWith({ size: 256 });

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.thumbnail?.url).toBe(avatarUrl);
		});

		it('should request avatar with correct size parameter', async () => {
			await userExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockUser.displayAvatarURL).toHaveBeenCalledWith({ size: 256 });
		});

		it('should handle default avatar URLs', async () => {
			const defaultAvatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
			mockUser.displayAvatarURL = vi.fn().mockReturnValue(defaultAvatarUrl);

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.thumbnail?.url).toBe(defaultAvatarUrl);
		});

		it('should handle displayAvatarURL method throwing error', async () => {
			mockUser.displayAvatarURL = vi.fn().mockImplementation(() => {
				throw new Error('Avatar URL error');
			});

			// The command will throw when displayAvatarURL fails
			await expect(userExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Avatar URL error');
		});
	});

	describe('Embed Structure and Content', () => {
		it('should create embed with correct structure', async () => {
			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];

			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('User Information');
			expect(embed.data.fields).toHaveLength(3);
			expect(embed.data.thumbnail).toBeDefined();
			expect(embed.data.footer?.text).toBe('User ID: test_user_id_12345');
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should have correct field inline settings', async () => {
			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const fields = embed.data.fields!;

			// Username should be inline
			const usernameField = fields.find(field => field.name === 'Username');
			expect(usernameField?.inline).toBe(true);

			// Joined Server should be inline
			const joinedField = fields.find(field => field.name === 'Joined Server');
			expect(joinedField?.inline).toBe(true);

			// Account Created should not be inline
			const createdField = fields.find(field => field.name === 'Account Created');
			expect(createdField?.inline).toBe(false);
		});

		it('should include user ID in footer', async () => {
			mockUser.id = 'custom_user_id_999';

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			expect(embed.data.footer?.text).toBe('User ID: custom_user_id_999');
		});
	});

	describe('Guild Member Context', () => {
		it('should work with different member implementations', async () => {
			// Test with minimal member object
			const minimalMember = {
				user: mockUser,
				// No joinedTimestamp
			};

			mockInteraction.member = minimalMember as any;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'Joined Server',
									value: 'Unavailable',
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle member with zero joinedTimestamp', async () => {
			mockMember.joinedTimestamp = 0;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const joinedField = embed.data.fields!.find(field => field.name === 'Joined Server');

			// Zero timestamp is falsy, so it should show 'Unavailable'
			expect(joinedField?.value).toBe('Unavailable');
		});
	});

	describe('Error Scenarios', () => {
		it('should handle reply failure gracefully', async () => {
			mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Reply failed'));

			await expect(userExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Reply failed');
		});

		it('should handle missing user properties gracefully', async () => {
			// Remove user properties
			mockUser.username = undefined as any;
			mockUser.id = undefined as any;
			mockUser.createdTimestamp = undefined as any;

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			// Should still create embed, just with undefined values
			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];

			expect(embed.data.fields!.some(field => 
				field.name === 'Username' && field.value === undefined
			)).toBe(true);

			expect(embed.data.footer?.text).toContain('undefined');
		});

		it('should handle missing member object', async () => {
			mockInteraction.member = undefined as any;

			// The command will throw when trying to access member properties
			await expect(userExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow();
		});
	});

	describe('Display Name vs Username', () => {
		it('should use username field regardless of display name', async () => {
			mockUser.username = 'actual_username';
			mockUser.displayName = 'Different Display Name';

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const usernameField = embed.data.fields!.find(field => field.name === 'Username');

			// Should use username, not display name
			expect(usernameField?.value).toBe('actual_username');
		});

		it('should handle empty username', async () => {
			mockUser.username = '';

			await userExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			const usernameField = embed.data.fields!.find(field => field.name === 'Username');

			expect(usernameField?.value).toBe('');
		});
	});
});