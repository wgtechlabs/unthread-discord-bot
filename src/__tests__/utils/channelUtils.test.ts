/**
 * Test Suite: Channel Utilities
 *
 * Comprehensive tests for the channel utility module.
 * Tests cover forum channel validation, basic caching, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isForumChannel,
	validateForumChannelIds,
	getValidatedForumChannelIds,
	isValidatedForumChannel,
} from '@utils/channelUtils';
import channelUtils from '@utils/channelUtils';
import { LogEngine } from '@wgtechlabs/log-engine';
import { ChannelType } from 'discord.js';

describe('channelUtils', () => {
	beforeEach(() => {
		// Create spies for LogEngine methods to enable assertions
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Reset global state
		global.discordClient = {
			channels: {
				fetch: vi.fn(),
			},
		} as any;

		// Reset environment variables
		delete process.env.FORUM_CHANNEL_IDS;
	});

	afterEach(() => {
		// Restore all mocks and spies
		vi.restoreAllMocks();
		// Clear all mock call history
		vi.clearAllMocks();
		// Reset environment variables
		delete process.env.FORUM_CHANNEL_IDS;
		// Reset global
		global.discordClient = undefined;
	});

	describe('isForumChannel', () => {
		it('should return true for valid forum channels', async () => {
			const mockChannel = { type: ChannelType.GuildForum };
			global.discordClient.channels.fetch = vi.fn().mockResolvedValue(mockChannel);

			const result = await isForumChannel('123456789');

			expect(result).toBe(true);
			expect(global.discordClient.channels.fetch).toHaveBeenCalledWith('123456789');
		});

		it('should return false for non-forum channels', async () => {
			const mockChannel = { type: ChannelType.GuildText };
			global.discordClient.channels.fetch = vi.fn().mockResolvedValue(mockChannel);

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(global.discordClient.channels.fetch).toHaveBeenCalledWith('123456789');
		});

		it('should return false when channel is not found', async () => {
			global.discordClient.channels.fetch = vi.fn().mockResolvedValue(null);

			const result = await isForumChannel('invalid-id');

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel invalid-id not found');
		});

		it('should return false when Discord client is not available', async () => {
			global.discordClient = undefined;

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('Discord client not available for channel type validation');
		});

		it('should handle fetch errors gracefully', async () => {
			const error = new Error('Network error');
			global.discordClient.channels.fetch = vi.fn().mockRejectedValue(error);

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 123456789:', error);
		});

		it('should handle different channel types', async () => {
			const channelTypes = [
				{ type: ChannelType.GuildText, expected: false },
				{ type: ChannelType.GuildVoice, expected: false },
				{ type: ChannelType.GuildCategory, expected: false },
				{ type: ChannelType.GuildAnnouncement, expected: false },
				{ type: ChannelType.GuildForum, expected: true },
				{ type: ChannelType.GuildStageVoice, expected: false },
			];

			for (const { type, expected } of channelTypes) {
				global.discordClient.channels.fetch = vi.fn().mockResolvedValue({ type });
				const result = await isForumChannel('test-channel');
				expect(result).toBe(expected);
			}
		});
	});

	describe('validateForumChannelIds', () => {
		it('should validate forum channel IDs', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockResolvedValueOnce({ type: ChannelType.GuildText })
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123,456,789');

			expect(result).toEqual(['123', '789']);
			expect(LogEngine.debug).toHaveBeenCalledWith('Validated forum channel: 123');
			expect(LogEngine.debug).toHaveBeenCalledWith('Validated forum channel: 789');
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel 456 in FORUM_CHANNEL_IDS is not a forum channel - skipping');
		});

		it('should return empty array for empty input', async () => {
			const result = await validateForumChannelIds('');
			expect(result).toEqual([]);
		});

		it('should return empty array for undefined input', async () => {
			const result = await validateForumChannelIds(undefined as any);
			expect(result).toEqual([]);
		});

		it('should handle whitespace and empty entries', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds(' 123 , , 456 , ');

			expect(result).toEqual(['123', '456']);
			expect(global.discordClient.channels.fetch).toHaveBeenCalledTimes(2);
		});

		it('should handle validation errors gracefully', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockRejectedValueOnce(new Error('Fetch error'))
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123,456,789');

			expect(result).toEqual(['123', '789']);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 456:', expect.any(Error));
		});

		it('should handle single channel ID', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123456789');

			expect(result).toEqual(['123456789']);
		});
	});

	describe('getValidatedForumChannelIds', () => {
		it('should validate forum channel IDs from environment', async () => {
			process.env.FORUM_CHANNEL_IDS = '123,456,789';
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const result = await getValidatedForumChannelIds();

			expect(result).toEqual(['123', '456', '789']);
			expect(LogEngine.info).toHaveBeenCalledWith('Validated 3 forum channels from FORUM_CHANNEL_IDS');
		});

		it('should handle mixed valid and invalid channels from environment', async () => {
			process.env.FORUM_CHANNEL_IDS = 'valid1,invalid1,valid2';
			
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })    // valid1
				.mockResolvedValueOnce({ type: ChannelType.GuildText })     // invalid1
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });   // valid2

			const result = await getValidatedForumChannelIds();

			expect(result).toEqual(['valid1', 'valid2']);
			expect(LogEngine.info).toHaveBeenCalledWith('Validated 2 forum channels from FORUM_CHANNEL_IDS');
		});
	});

	describe('isValidatedForumChannel', () => {
		it('should return true for validated forum channels', async () => {
			process.env.FORUM_CHANNEL_IDS = '123,456,789';
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const result = await isValidatedForumChannel('456');

			expect(result).toBe(true);
		});

		it('should return false for non-validated channels', async () => {
			process.env.FORUM_CHANNEL_IDS = '123,456,789';
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const result = await isValidatedForumChannel('999');

			expect(result).toBe(false);
		});
	});

	describe('Module Exports', () => {
		it('should export named functions correctly', () => {
			expect(typeof isForumChannel).toBe('function');
			expect(typeof validateForumChannelIds).toBe('function');
			expect(typeof getValidatedForumChannelIds).toBe('function');
			expect(typeof isValidatedForumChannel).toBe('function');
		});

		it('should export default object with all utility functions', () => {
			expect(typeof channelUtils).toBe('object');
			expect(typeof channelUtils.isForumChannel).toBe('function');
			expect(typeof channelUtils.validateForumChannelIds).toBe('function');
			expect(typeof channelUtils.getValidatedForumChannelIds).toBe('function');
			expect(typeof channelUtils.isValidatedForumChannel).toBe('function');
		});

		it('should have consistent behavior between named and default exports', async () => {
			process.env.FORUM_CHANNEL_IDS = '123';
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const namedResult = await isValidatedForumChannel('123');
			const defaultResult = await channelUtils.isValidatedForumChannel('123');

			expect(namedResult).toBe(defaultResult);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle null Discord client gracefully', async () => {
			global.discordClient = null as any;

			const result = await isForumChannel('123');

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('Discord client not available for channel type validation');
		});

		it('should handle malformed channel data', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ notAType: 'invalid' });

			const result = await isForumChannel('123');

			expect(result).toBe(false);
		});

		it('should handle channel fetch timeout', async () => {
			const timeoutError = new Error('Request timeout');
			global.discordClient.channels.fetch = vi.fn().mockRejectedValue(timeoutError);

			const result = await isForumChannel('123');

			expect(result).toBe(false);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 123:', timeoutError);
		});

		it('should handle invalid channel IDs', async () => {
			global.discordClient.channels.fetch = vi.fn().mockResolvedValue(null);

			const result = await validateForumChannelIds('invalid,also-invalid');

			expect(result).toEqual([]);
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel invalid not found');
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel also-invalid not found');
		});

		it('should handle empty channel ID in list', async () => {
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValue({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123,,456');

			expect(result).toEqual(['123', '456']);
			expect(global.discordClient.channels.fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete workflow with mixed channel types', async () => {
			process.env.FORUM_CHANNEL_IDS = 'valid1,invalid1,valid2';
			
			global.discordClient.channels.fetch = vi.fn()
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })    // valid1
				.mockResolvedValueOnce({ type: ChannelType.GuildText })     // invalid1
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });   // valid2

			// Should validate and filter channels
			const validChannels = await getValidatedForumChannelIds();
			expect(validChannels).toEqual(['valid1', 'valid2']);

			// Should work for validated channels
			expect(await isValidatedForumChannel('valid1')).toBe(true);
			expect(await isValidatedForumChannel('valid2')).toBe(true);

			// Should not work for invalid channels
			expect(await isValidatedForumChannel('invalid1')).toBe(false);
			expect(await isValidatedForumChannel('nonexistent')).toBe(false);
		});
	});
});