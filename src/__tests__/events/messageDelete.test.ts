/**
 * Test Suite: Message Delete Event Handler
 *
 * Comprehensive tests for the Discord.js messageDelete event handler.
 * Tests cover message caching, bot message filtering, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Events, Message, User, TextChannel } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { BotsStore } from '../../sdk/bots-brain/BotsStore';
import { execute, name } from '../../events/messageDelete';

// Mock BotsStore
vi.mock('../../sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(),
	},
}));

describe('messageDelete event handler', () => {
	let mockMessage: Partial<Message>;
	let mockChannel: Partial<TextChannel>;
	let mockAuthor: Partial<User>;
	let mockBotsStore: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Setup mock BotsStore
		mockBotsStore = {
			setBotConfig: vi.fn().mockResolvedValue(undefined),
			getBotConfig: vi.fn().mockResolvedValue([]),
		};
		(BotsStore.getInstance as any).mockReturnValue(mockBotsStore);

		// Setup mock author (human user)
		mockAuthor = {
			bot: false,
			id: 'user123',
			username: 'testuser',
		};

		// Setup mock channel
		mockChannel = {
			id: 'channel123',
			name: 'general',
		};

		// Setup mock message
		mockMessage = {
			id: 'message123',
			author: mockAuthor as User,
			channel: mockChannel as TextChannel,
			content: 'Test message content',
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('event configuration', () => {
		it('should have correct event name', () => {
			expect(name).toBe(Events.MessageDelete);
		});
	});

	describe('bot message filtering', () => {
		it('should ignore bot messages', async () => {
			mockAuthor.bot = true;

			await execute(mockMessage as Message);

			expect(BotsStore.getInstance).not.toHaveBeenCalled();
			expect(mockBotsStore.setBotConfig).not.toHaveBeenCalled();
			expect(LogEngine.debug).not.toHaveBeenCalled();
		});

		it('should process human user messages', async () => {
			mockAuthor.bot = false;

			await execute(mockMessage as Message);

			expect(BotsStore.getInstance).toHaveBeenCalledOnce();
			expect(mockBotsStore.setBotConfig).toHaveBeenCalled();
		});

		it('should process messages with missing author (author is undefined)', async () => {
			mockMessage.author = undefined;

			await execute(mockMessage as Message);

			// Should process when author is undefined (as it doesn't trigger the bot check)
			expect(BotsStore.getInstance).toHaveBeenCalledOnce();
		});
	});

	describe('individual message caching', () => {
		it('should cache deleted message with correct key and TTL', async () => {
			const mockTimestamp = 1640995200000; // Fixed timestamp for testing
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalledWith(
				'deleted:message123',
				{
					channelId: 'channel123',
					timestamp: mockTimestamp,
				},
				300 // 5 minutes TTL
			);
		});

		it('should handle setBotConfig errors for individual message', async () => {
			const cacheError = new Error('Cache failed');
			mockBotsStore.setBotConfig.mockRejectedValueOnce(cacheError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith('Error caching deleted message:', cacheError);
		});
	});

	describe('channel-based message tracking', () => {
		it('should retrieve existing channel deletion history', async () => {
			const existingHistory = [
				{ messageId: 'old1', timestamp: Date.now() - 30000 },
				{ messageId: 'old2', timestamp: Date.now() - 45000 },
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingHistory);

			await execute(mockMessage as Message);

			expect(mockBotsStore.getBotConfig).toHaveBeenCalledWith('deleted:channel:channel123');
		});

		it('should add new message to channel deletion history', async () => {
			const mockTimestamp = 1640995200000;
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			const existingHistory = [
				{ messageId: 'old1', timestamp: mockTimestamp - 30000 },
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingHistory);

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalledWith(
				'deleted:channel:channel123',
				[
					{ messageId: 'old1', timestamp: mockTimestamp - 30000 },
					{ messageId: 'message123', timestamp: mockTimestamp },
				],
				60 // 1 minute TTL
			);
		});

		it('should filter out messages older than 1 minute', async () => {
			const mockTimestamp = 1640995200000;
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			const existingHistory = [
				{ messageId: 'recent', timestamp: mockTimestamp - 30000 }, // 30 seconds ago
				{ messageId: 'old', timestamp: mockTimestamp - 90000 },    // 90 seconds ago (should be filtered)
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingHistory);

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalledWith(
				'deleted:channel:channel123',
				[
					{ messageId: 'recent', timestamp: mockTimestamp - 30000 },
					{ messageId: 'message123', timestamp: mockTimestamp },
				],
				60
			);
		});

		it('should limit to 10 most recent deletions', async () => {
			const mockTimestamp = 1640995200000;
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			// Create 12 recent messages (all within 1 minute)
			const existingHistory = Array.from({ length: 12 }, (_, i) => ({
				messageId: `msg${i}`,
				timestamp: mockTimestamp - (i * 1000), // Each 1 second apart
			}));
			mockBotsStore.getBotConfig.mockResolvedValue(existingHistory);

			await execute(mockMessage as Message);

			// Check the second setBotConfig call (for channel history)
			expect(mockBotsStore.setBotConfig).toHaveBeenCalledTimes(2);
			const channelHistoryCall = mockBotsStore.setBotConfig.mock.calls[1];
			expect(channelHistoryCall[0]).toBe('deleted:channel:channel123');
			expect(channelHistoryCall[2]).toBe(60);
			expect(channelHistoryCall[1]).toHaveLength(10);
			
			// Check that the newest message is at the end
			const actualHistory = channelHistoryCall[1];
			expect(actualHistory[actualHistory.length - 1]).toEqual({
				messageId: 'message123',
				timestamp: mockTimestamp,
			});
		});

		it('should handle empty existing history', async () => {
			const mockTimestamp = 1640995200000;
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			mockBotsStore.getBotConfig.mockResolvedValue(null);

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalledWith(
				'deleted:channel:channel123',
				[{ messageId: 'message123', timestamp: mockTimestamp }],
				60
			);
		});
	});

	describe('logging', () => {
		it('should log successful message caching', async () => {
			await execute(mockMessage as Message);

			expect(LogEngine.debug).toHaveBeenCalledWith(
				'Cached deleted message ID: message123 from channel: channel123'
			);
		});

		it('should not log when bot messages are ignored', async () => {
			mockAuthor.bot = true;

			await execute(mockMessage as Message);

			expect(LogEngine.debug).not.toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle BotsStore.getInstance errors', async () => {
			const instanceError = new Error('Failed to get instance');
			(BotsStore.getInstance as any).mockImplementation(() => {
				throw instanceError;
			});

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith('Error caching deleted message:', instanceError);
		});

		it('should handle getBotConfig errors', async () => {
			const getError = new Error('Get config failed');
			mockBotsStore.getBotConfig.mockRejectedValue(getError);

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith('Error caching deleted message:', getError);
		});

		it('should handle setBotConfig errors for channel history', async () => {
			// First setBotConfig call (individual message) succeeds
			// Second setBotConfig call (channel history) fails
			const channelError = new Error('Channel cache failed');
			mockBotsStore.setBotConfig
				.mockResolvedValueOnce(undefined) // Individual message succeeds
				.mockRejectedValueOnce(channelError); // Channel history fails

			await execute(mockMessage as Message);

			expect(LogEngine.error).toHaveBeenCalledWith('Error caching deleted message:', channelError);
		});

		it('should handle malformed existing history data', async () => {
			// Return malformed data that doesn't have timestamp property
			const malformedHistory = [
				{ messageId: 'msg1' }, // Missing timestamp
				{ messageId: 'msg2', timestamp: 'invalid' }, // Invalid timestamp
			];
			mockBotsStore.getBotConfig.mockResolvedValue(malformedHistory);

			await execute(mockMessage as Message);

			// Should not crash and should still process
			expect(LogEngine.debug).toHaveBeenCalledWith(
				'Cached deleted message ID: message123 from channel: channel123'
			);
		});
	});

	describe('integration scenarios', () => {
		it('should complete full caching workflow successfully', async () => {
			const mockTimestamp = 1640995200000;
			vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

			const existingHistory = [
				{ messageId: 'recent1', timestamp: mockTimestamp - 30000 },
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingHistory);

			await execute(mockMessage as Message);

			// Verify all operations completed
			expect(BotsStore.getInstance).toHaveBeenCalledOnce();
			expect(mockBotsStore.setBotConfig).toHaveBeenCalledTimes(2);
			expect(mockBotsStore.getBotConfig).toHaveBeenCalledOnce();
			expect(LogEngine.debug).toHaveBeenCalledWith(
				'Cached deleted message ID: message123 from channel: channel123'
			);
		});

		it('should handle multiple messages in same channel', async () => {
			const baseTimestamp = 1640995200000;
			vi.spyOn(Date, 'now')
				.mockReturnValueOnce(baseTimestamp)
				.mockReturnValueOnce(baseTimestamp + 1000)
				.mockReturnValueOnce(baseTimestamp + 2000);

			// First message
			await execute(mockMessage as Message);

			// Second message
			const message2 = { ...mockMessage, id: 'message456' };
			mockBotsStore.getBotConfig.mockResolvedValue([
				{ messageId: 'message123', timestamp: baseTimestamp },
			]);
			await execute(message2 as Message);

			// Verify both messages were cached
			expect(LogEngine.debug).toHaveBeenCalledTimes(2);
			expect(LogEngine.debug).toHaveBeenNthCalledWith(1,
				'Cached deleted message ID: message123 from channel: channel123'
			);
			expect(LogEngine.debug).toHaveBeenNthCalledWith(2,
				'Cached deleted message ID: message456 from channel: channel123'
			);
		});
	});
});