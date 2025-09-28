/**
 * Test Suite: Message Delete Event Handler
 *
 * Tests for the message deletion tracking event handler that caches
 * deleted messages for moderation and unthread operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events, Message } from 'discord.js';
import { LogEngine } from '@config/logger';
import { BotsStore } from '@sdk/bots-brain/BotsStore';
import { name, execute } from '@events/messageDelete';

// Mock the BotsStore
vi.mock('@sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(() => ({
			setBotConfig: vi.fn().mockResolvedValue(undefined),
			getBotConfig: vi.fn().mockResolvedValue([]),
		})),
	},
}));

describe('Message Delete Event Handler', () => {
	let mockBotsStore: any;
	let mockMessage: Partial<Message>;

	beforeEach(() => {
		vi.clearAllMocks();
		
		mockBotsStore = {
			setBotConfig: vi.fn().mockResolvedValue(undefined),
			getBotConfig: vi.fn().mockResolvedValue([]),
		};
		(BotsStore.getInstance as any).mockReturnValue(mockBotsStore);

		mockMessage = {
			id: 'test_message_id',
			author: {
				bot: false,
				id: 'test_user_id',
			} as any,
			channel: {
				id: 'test_channel_id',
			} as any,
		};
	});

	describe('Event Configuration', () => {
		it('should export correct event name', () => {
			expect(name).toBe(Events.MessageDelete);
		});
	});

	describe('Bot Message Filtering', () => {
		it('should ignore bot messages', async () => {
			mockMessage.author!.bot = true;

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).not.toHaveBeenCalled();
			expect(LogEngine.debug).not.toHaveBeenCalled();
		});

		it('should process user messages', async () => {
			mockMessage.author!.bot = false;

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalled();
		});

		it('should handle missing author gracefully', async () => {
			mockMessage.author = undefined;

			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalled();
		});
	});

	describe('Message Caching', () => {
		it('should cache deleted message with 5-minute TTL', async () => {
			await execute(mockMessage as Message);

			expect(mockBotsStore.setBotConfig).toHaveBeenCalledWith(
				`deleted:${mockMessage.id}`,
				{
					channelId: mockMessage.channel!.id,
					timestamp: expect.any(Number),
				},
				300 // 5 minutes in seconds
			);
		});

		it('should include current timestamp in cached data', async () => {
			const beforeTimestamp = Date.now();
			
			await execute(mockMessage as Message);

			const cacheCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === `deleted:${mockMessage.id}`
			);
			
			expect(cacheCall[1].timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
			expect(cacheCall[1].timestamp).toBeLessThanOrEqual(Date.now());
		});

		it('should log successful caching with debug level', async () => {
			await execute(mockMessage as Message);

			expect(LogEngine.debug).toHaveBeenCalledWith(
				`Cached deleted message ID: ${mockMessage.id} from channel: ${mockMessage.channel!.id}`
			);
		});
	});

	describe('Channel-based Tracking', () => {
		it('should track multiple deletions per channel', async () => {
			const existingDeletions = [
				{ messageId: 'old_message_1', timestamp: Date.now() - 30000 },
				{ messageId: 'old_message_2', timestamp: Date.now() - 15000 },
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingDeletions);

			await execute(mockMessage as Message);

			const channelKey = `deleted:channel:${mockMessage.channel!.id}`;
			expect(mockBotsStore.getBotConfig).toHaveBeenCalledWith(channelKey);
			
			const channelUpdateCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === channelKey
			);
			expect(channelUpdateCall[1]).toHaveLength(3); // 2 existing + 1 new
		});

		it('should filter out messages older than 1 minute', async () => {
			const oldTimestamp = Date.now() - 120000; // 2 minutes ago
			const recentTimestamp = Date.now() - 30000; // 30 seconds ago
			
			const existingDeletions = [
				{ messageId: 'old_message', timestamp: oldTimestamp },
				{ messageId: 'recent_message', timestamp: recentTimestamp },
			];
			mockBotsStore.getBotConfig.mockResolvedValue(existingDeletions);

			await execute(mockMessage as Message);

			const channelKey = `deleted:channel:${mockMessage.channel!.id}`;
			const channelUpdateCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === channelKey
			);
			
			// Should only have recent message + new message (old filtered out)
			expect(channelUpdateCall[1]).toHaveLength(2);
			expect(channelUpdateCall[1].some((item: any) => item.messageId === 'old_message')).toBe(false);
			expect(channelUpdateCall[1].some((item: any) => item.messageId === 'recent_message')).toBe(true);
		});

		it('should limit to maximum 10 recent deletions', async () => {
			// Create 12 recent deletions (all within last minute)
			const manyDeletions = Array.from({ length: 12 }, (_, i) => ({
				messageId: `message_${i}`,
				timestamp: Date.now() - (i * 1000), // Spread over last 12 seconds
			}));
			mockBotsStore.getBotConfig.mockResolvedValue(manyDeletions);

			await execute(mockMessage as Message);

			const channelKey = `deleted:channel:${mockMessage.channel!.id}`;
			const channelUpdateCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === channelKey
			);
			
			// Should be limited to 10 items (keeps most recent)
			expect(channelUpdateCall[1]).toHaveLength(10);
		});

		it('should use 1-minute TTL for channel tracking', async () => {
			await execute(mockMessage as Message);

			const channelKey = `deleted:channel:${mockMessage.channel!.id}`;
			const channelUpdateCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === channelKey
			);
			
			expect(channelUpdateCall[2]).toBe(60); // 1 minute in seconds
		});
	});

	describe('Error Handling', () => {
		it('should handle BotsStore errors gracefully', async () => {
			const storeError = new Error('Storage failed');
			mockBotsStore.setBotConfig.mockRejectedValue(storeError);

			await expect(execute(mockMessage as Message)).resolves.not.toThrow();
			
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error caching deleted message:',
				storeError
			);
		});

		it('should handle getBotConfig errors', async () => {
			const getConfigError = new Error('Get config failed');
			mockBotsStore.getBotConfig.mockRejectedValue(getConfigError);

			await expect(execute(mockMessage as Message)).resolves.not.toThrow();
			
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error caching deleted message:',
				getConfigError
			);
		});

		it('should handle missing channel information', async () => {
			mockMessage.channel = undefined;

			await expect(execute(mockMessage as Message)).resolves.not.toThrow();
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

	describe('Integration Testing', () => {
		it('should handle rapid sequential deletions', async () => {
			const messages = [
				{ ...mockMessage, id: 'msg1' },
				{ ...mockMessage, id: 'msg2' },
				{ ...mockMessage, id: 'msg3' },
			];

			// Simulate rapid deletions
			await Promise.all(messages.map(msg => execute(msg as Message)));

			// Should cache each message individually
			expect(mockBotsStore.setBotConfig).toHaveBeenCalledTimes(6); // 3 individual + 3 channel updates
		});

		it('should work with empty channel deletion history', async () => {
			mockBotsStore.getBotConfig.mockResolvedValue(null);

			await execute(mockMessage as Message);

			const channelKey = `deleted:channel:${mockMessage.channel!.id}`;
			const channelUpdateCall = mockBotsStore.setBotConfig.mock.calls.find(
				(call: any[]) => call[0] === channelKey
			);
			
			expect(channelUpdateCall[1]).toHaveLength(1); // Only the new message
		});
	});
});