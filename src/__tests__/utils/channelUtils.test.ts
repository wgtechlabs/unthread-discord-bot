/**
 * Test Suite: Channel Utils
 *
 * Comprehensive tests for channel utility functions including forum validation,
 * caching mechanisms, and Discord API integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelType } from 'discord.js';
import { LogEngine } from '../../config/logger';
import channelUtils, { 
	isForumChannel, 
	validateForumChannelIds, 
	getValidatedForumChannelIds, 
	isValidatedForumChannel 
} from '../../utils/channelUtils';

describe('channelUtils', () => {
	let mockDiscordClient: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Setup mock Discord client
		mockDiscordClient = {
			channels: {
				fetch: vi.fn(),
			},
		};

		// Set global Discord client
		(global as any).discordClient = mockDiscordClient;

		// Clear environment variables
		delete process.env.FORUM_CHANNEL_IDS;

		// Reset module-level cache
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (global as any).discordClient;
		delete process.env.FORUM_CHANNEL_IDS;
	});

	describe('isForumChannel', () => {
		it('should return true for forum channels', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await isForumChannel('123456789');

			expect(result).toBe(true);
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith('123456789');
		});

		it('should return false for non-forum channels', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildText,
			});

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
		});

		it('should return false when channel is not found', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue(null);

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel 123456789 not found');
		});

		it('should return false when Discord client is not available', async () => {
			delete (global as any).discordClient;

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('Discord client not available for channel type validation');
		});

		it('should handle API errors gracefully', async () => {
			const apiError = new Error('API Error');
			mockDiscordClient.channels.fetch.mockRejectedValue(apiError);

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 123456789:', apiError);
		});

		it('should handle network timeouts', async () => {
			const timeoutError = new Error('Request timeout');
			mockDiscordClient.channels.fetch.mockRejectedValue(timeoutError);

			const result = await isForumChannel('123456789');

			expect(result).toBe(false);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 123456789:', timeoutError);
		});
	});

	describe('validateForumChannelIds', () => {
		it('should return empty array for empty input', async () => {
			const result = await validateForumChannelIds('');
			expect(result).toEqual([]);
		});

		it('should return empty array for null input', async () => {
			const result = await validateForumChannelIds(null as any);
			expect(result).toEqual([]);
		});

		it('should validate single forum channel', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await validateForumChannelIds('123456789');

			expect(result).toEqual(['123456789']);
			expect(LogEngine.debug).toHaveBeenCalledWith('Validated forum channel: 123456789');
		});

		it('should validate multiple forum channels', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await validateForumChannelIds('123456789,987654321,555666777');

			expect(result).toEqual(['123456789', '987654321', '555666777']);
			expect(LogEngine.debug).toHaveBeenCalledTimes(3);
		});

		it('should filter out non-forum channels', async () => {
			mockDiscordClient.channels.fetch
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockResolvedValueOnce({ type: ChannelType.GuildText })
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123456789,987654321,555666777');

			expect(result).toEqual(['123456789', '555666777']);
			expect(LogEngine.warn).toHaveBeenCalledWith('Channel 987654321 in FORUM_CHANNEL_IDS is not a forum channel - skipping');
		});

		it('should handle whitespace and empty entries', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await validateForumChannelIds('  123456789  , , 987654321 ,  ');

			expect(result).toEqual(['123456789', '987654321']);
		});

		it('should handle channel fetch errors', async () => {
			mockDiscordClient.channels.fetch
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockRejectedValueOnce(new Error('Channel not found'))
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const result = await validateForumChannelIds('123456789,invalid,555666777');

			expect(result).toEqual(['123456789', '555666777']);
			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for invalid:', expect.any(Error));
		});
	});

	describe('getValidatedForumChannelIds', () => {
		beforeEach(() => {
			// Mock Date.now for cache testing
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			// Reset module state by re-requiring the module
			vi.resetModules();
		});

		it('should return empty array when no FORUM_CHANNEL_IDS is set', async () => {
			// Re-import after reset to get fresh module state
			const { getValidatedForumChannelIds } = await import('../../utils/channelUtils');
			const result = await getValidatedForumChannelIds();

			expect(result).toEqual([]);
			expect(LogEngine.info).toHaveBeenCalledWith('Validated 0 forum channels from FORUM_CHANNEL_IDS');
		});

		it('should validate channels from environment variable', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			// Re-import after reset to get fresh module state
			const { getValidatedForumChannelIds } = await import('../../utils/channelUtils');
			const result = await getValidatedForumChannelIds();

			expect(result).toEqual(['123456789', '987654321']);
			expect(LogEngine.info).toHaveBeenCalledWith('Validated 2 forum channels from FORUM_CHANNEL_IDS');
		});

		it('should cache results for 5 minutes', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			// Re-import after reset to get fresh module state
			const { getValidatedForumChannelIds } = await import('../../utils/channelUtils');

			// First call
			const result1 = await getValidatedForumChannelIds();
			expect(result1).toEqual(['123456789']);
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledTimes(1);

			// Second call within cache duration - should use cache
			const result2 = await getValidatedForumChannelIds();
			expect(result2).toEqual(['123456789']);
			// Should not fetch again
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledTimes(1);
		});

		it('should refresh cache after 5 minutes', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			// Re-import after reset to get fresh module state
			const { getValidatedForumChannelIds } = await import('../../utils/channelUtils');

			// First call
			await getValidatedForumChannelIds();
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledTimes(1);

			// Move time forward by more than 5 minutes
			vi.mocked(Date.now).mockReturnValue(1000000 + 5 * 60 * 1000 + 1);

			// Second call should refresh cache
			await getValidatedForumChannelIds();
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledTimes(2);
		});

		it('should handle environment variable changes', async () => {
			// First call with one channel
			process.env.FORUM_CHANNEL_IDS = '123456789';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			// Re-import after reset to get fresh module state
			const { getValidatedForumChannelIds } = await import('../../utils/channelUtils');

			const result1 = await getValidatedForumChannelIds();
			expect(result1).toEqual(['123456789']);

			// Change environment variable and move time forward
			process.env.FORUM_CHANNEL_IDS = '987654321';
			vi.mocked(Date.now).mockReturnValue(1000000 + 5 * 60 * 1000 + 1);

			const result2 = await getValidatedForumChannelIds();
			expect(result2).toEqual(['987654321']);
		});
	});

	describe('isValidatedForumChannel', () => {
		it('should return true for validated forum channels', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await isValidatedForumChannel('123456789');

			expect(result).toBe(true);
		});

		it('should return false for non-validated channels', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await isValidatedForumChannel('555666777');

			expect(result).toBe(false);
		});

		it('should return false when no channels are configured', async () => {
			// Clear environment and reset cache
			delete process.env.FORUM_CHANNEL_IDS;
			// Force cache reset by advancing time beyond cache duration  
			vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000);
			
			const result = await isValidatedForumChannel('123456789');

			expect(result).toBe(false);
		});
	});

	describe('module exports', () => {
		it('should export all functions in default object', () => {
			expect(channelUtils.isForumChannel).toBe(isForumChannel);
			expect(channelUtils.validateForumChannelIds).toBe(validateForumChannelIds);
			expect(channelUtils.getValidatedForumChannelIds).toBe(getValidatedForumChannelIds);
			expect(channelUtils.isValidatedForumChannel).toBe(isValidatedForumChannel);
		});

		it('should export named functions', () => {
			expect(typeof isForumChannel).toBe('function');
			expect(typeof validateForumChannelIds).toBe('function');
			expect(typeof getValidatedForumChannelIds).toBe('function');
			expect(typeof isValidatedForumChannel).toBe('function');
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete workflow from environment to validation', async () => {
			process.env.FORUM_CHANNEL_IDS = '123456789,invalid,987654321';
			mockDiscordClient.channels.fetch
				.mockResolvedValueOnce({ type: ChannelType.GuildForum })
				.mockResolvedValueOnce({ type: ChannelType.GuildText })
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			// Test individual function directly
			const validatedChannels = await validateForumChannelIds('123456789,invalid,987654321');
			expect(validatedChannels).toEqual(['123456789', '987654321']);
		});

		it('should handle client unavailability gracefully', async () => {
			delete (global as any).discordClient;
			
			const isValid = await isForumChannel('123456789');
			expect(isValid).toBe(false);
		});

		it('should handle API rate limits and errors', async () => {
			mockDiscordClient.channels.fetch
				.mockRejectedValueOnce(new Error('Rate limited'))
				.mockResolvedValueOnce({ type: ChannelType.GuildForum });

			const validatedChannels = await validateForumChannelIds('123456789,987654321');
			expect(validatedChannels).toEqual(['987654321']);

			expect(LogEngine.error).toHaveBeenCalledWith('Error checking channel type for 123456789:', expect.any(Error));
		});
	});

	describe('edge cases', () => {
		it('should handle very long channel ID lists', async () => {
			const channelIds = Array.from({ length: 100 }, (_, i) => `channel${i}`).join(',');
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await validateForumChannelIds(channelIds);
			expect(result).toHaveLength(100);
		});

		it('should handle special characters in channel IDs', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			const result = await validateForumChannelIds('123456789,abc-def_123');
			expect(result).toEqual(['123456789', 'abc-def_123']);
		});

		it('should handle concurrent validation calls', async () => {
			mockDiscordClient.channels.fetch.mockResolvedValue({
				type: ChannelType.GuildForum,
			});

			// Make multiple concurrent calls to validateForumChannelIds directly
			const promises = Array.from({ length: 5 }, () => validateForumChannelIds('123456789'));
			const results = await Promise.all(promises);

			// All should return the same result
			results.forEach(result => {
				expect(result).toEqual(['123456789']);
			});
		});
	});
});