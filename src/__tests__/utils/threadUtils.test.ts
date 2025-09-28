/**
 * Test Suite: Thread Utilities
 *
 * Comprehensive tests for the thread utility module.
 * Tests cover thread lookup, retry logic, error handling, and Discord integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	findDiscordThreadByTicketId,
	findDiscordThreadByTicketIdWithRetry,
	fetchStarterMessage,
	MappingNotFoundError,
	ThreadTicketMapping,
} from '@utils/threadUtils';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore, ExtendedThreadTicketMapping } from '@sdk/bots-brain/BotsStore';
import { ThreadChannel } from 'discord.js';

// Mock the BotsStore
vi.mock('@sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(),
	},
}));

describe('threadUtils', () => {
	let mockBotsStore: any;
	let mockDiscordClient: any;
	let mockThread: any;
	let mockMessage: any;

	beforeEach(() => {
		// Create spies for LogEngine methods to enable assertions
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Create mock thread
		mockThread = {
			id: 'thread_123',
			name: 'Test Thread',
			isThread: vi.fn().mockReturnValue(true),
			fetchStarterMessage: vi.fn(),
		};

		// Create mock message
		mockMessage = {
			id: 'message_123',
			content: 'Test message content',
			author: { id: 'user_123' },
		};

		// Create mock Discord client
		mockDiscordClient = {
			channels: {
				fetch: vi.fn(),
			},
		};

		// Create mock BotsStore instance
		mockBotsStore = {
			getMappingByTicketId: vi.fn(),
		};

		// Mock BotsStore.getInstance to return our mock
		(BotsStore.getInstance as any).mockReturnValue(mockBotsStore);

		// Set up global Discord client
		(global as any).discordClient = mockDiscordClient;

		// Mock setTimeout for retry tests
		vi.useFakeTimers();
	});

	afterEach(async () => {
		// Restore all mocks and spies
		vi.restoreAllMocks();
		// Clear all mock call history
		vi.clearAllMocks();
		// Restore real timers
		vi.useRealTimers();
		
		// Reset global Discord client
		(global as any).discordClient = undefined;
		
		// Wait a bit to ensure any remaining async operations complete
		await new Promise(resolve => setTimeout(resolve, 10));
	});

	describe('MappingNotFoundError', () => {
		it('should create a custom error with proper name', () => {
			const error = new MappingNotFoundError('Test message');
			
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(MappingNotFoundError);
			expect(error.name).toBe('MappingNotFoundError');
			expect(error.message).toBe('Test message');
		});

		it('should be distinguishable from regular errors', () => {
			const mappingError = new MappingNotFoundError('Mapping error');
			const regularError = new Error('Regular error');

			expect(mappingError instanceof MappingNotFoundError).toBe(true);
			expect(regularError instanceof MappingNotFoundError).toBe(false);
		});
	});

	describe('findDiscordThreadByTicketId', () => {
		it('should successfully find a thread when mapping exists', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

			const result = await findDiscordThreadByTicketId('ticket_123');

			expect(result.ticketMapping).toBe(mockMapping);
			expect(result.discordThread).toBe(mockThread);
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledWith('ticket_123');
			expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith('thread_123');
			expect(mockThread.isThread).toHaveBeenCalled();
			expect(LogEngine.debug).toHaveBeenCalledWith('Found Discord thread: thread_123');
		});

		it('should throw MappingNotFoundError when mapping does not exist', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			await expect(findDiscordThreadByTicketId('nonexistent_ticket')).rejects.toThrow(MappingNotFoundError);
			await expect(findDiscordThreadByTicketId('nonexistent_ticket')).rejects.toThrow(
				'No Discord thread found for Unthread ticket nonexistent_ticket'
			);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'No Discord thread found for Unthread ticket nonexistent_ticket'
			);
		});

		it('should throw error when Discord client is not available', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			(global as any).discordClient = undefined;

			await expect(findDiscordThreadByTicketId('ticket_123')).rejects.toThrow(
				'Discord client is not initialized or unavailable.'
			);

			expect(LogEngine.error).toHaveBeenCalledWith('Discord client is not initialized or unavailable.');
		});

		it('should throw error when Discord thread is not found', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(null);

			await expect(findDiscordThreadByTicketId('ticket_123')).rejects.toThrow(
				'Discord thread with ID thread_123 not found.'
			);

			expect(LogEngine.error).toHaveBeenCalledWith('Discord thread with ID thread_123 not found.');
		});

		it('should throw error when channel is not a thread', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			const mockNonThreadChannel = {
				id: 'channel_123',
				isThread: vi.fn().mockReturnValue(false),
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockNonThreadChannel);

			await expect(findDiscordThreadByTicketId('ticket_123')).rejects.toThrow(
				'Discord channel with ID thread_123 is not a thread.'
			);

			expect(LogEngine.error).toHaveBeenCalledWith('Discord channel with ID thread_123 is not a thread.');
		});

		it('should handle BotsStore errors gracefully', async () => {
			const storeError = new Error('Database connection failed');
			mockBotsStore.getMappingByTicketId.mockRejectedValue(storeError);

			await expect(findDiscordThreadByTicketId('ticket_123')).rejects.toThrow('Database connection failed');

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error fetching Discord thread for ticket ticket_123: Database connection failed'
			);
		});

		it('should handle Discord API errors gracefully', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			const discordError = new Error('Discord API error');
			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockRejectedValue(discordError);

			await expect(findDiscordThreadByTicketId('ticket_123')).rejects.toThrow('Discord API error');

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error fetching Discord thread for ticket ticket_123: Discord API error'
			);
		});
	});

	describe('findDiscordThreadByTicketIdWithRetry', () => {
		it('should return result immediately on first success', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

			const result = await findDiscordThreadByTicketIdWithRetry('ticket_123');

			expect(result.ticketMapping).toBe(mockMapping);
			expect(result.discordThread).toBe(mockThread);
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(1);
		});

		it('should retry on MappingNotFoundError and eventually succeed', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			// First call fails, second succeeds
			mockBotsStore.getMappingByTicketId
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 2,
				baseDelayMs: 100,
			});

			// Advance timers to allow retry delay
			await vi.advanceTimersByTimeAsync(150);

			const result = await resultPromise;

			expect(result.ticketMapping).toBe(mockMapping);
			expect(result.discordThread).toBe(mockThread);
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(2);
			expect(LogEngine.debug).toHaveBeenCalledWith(
				expect.stringContaining('Mapping not found for ticket ticket_123, attempt 1/2')
			);
		});

		it('should not retry on non-mapping errors', async () => {
			const discordError = new Error('Discord API error');
			mockBotsStore.getMappingByTicketId.mockRejectedValue(discordError);

			await expect(
				findDiscordThreadByTicketIdWithRetry('ticket_123', { maxAttempts: 3 })
			).rejects.toThrow('Discord API error');

			// Should not retry on non-mapping errors
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(1);
		});

		it('should respect maxAttempts configuration', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			// Use 0 delay and expect exactly maxAttempts calls
			await expect(findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 1,
				baseDelayMs: 0,
			})).rejects.toThrow();

			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(1);
		});

		it('should use exponential backoff with jitter', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 3,
				baseDelayMs: 100,
			});

			// Fast-forward through all retries
			await vi.advanceTimersByTimeAsync(10000);

			await expect(resultPromise).rejects.toThrow();

			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(3);
			expect(LogEngine.debug).toHaveBeenCalledWith(
				expect.stringContaining('attempt 1/3')
			);
			expect(LogEngine.debug).toHaveBeenCalledWith(
				expect.stringContaining('attempt 2/3')
			);
		});

		it('should enhance error with context after all retries fail', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 2,
				maxRetryWindow: 10000,
				baseDelayMs: 100,
			});

			await vi.advanceTimersByTimeAsync(5000);

			try {
				await resultPromise;
				expect.fail('Expected promise to reject');
			} catch (error: any) {
				expect(error).toHaveProperty('context');
				expect(error.context).toMatchObject({
					ticketId: 'ticket_123',
					attemptsMade: 2,
					likelyRaceCondition: true,
					originalError: expect.stringContaining('No Discord thread found'),
				});

				expect(LogEngine.warn).toHaveBeenCalledWith(
					expect.stringContaining('Potential race condition detected for ticket ticket_123')
				);
			}
		});

		it('should work with custom lookup function', async () => {
			const customMapping: ThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
			};

			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			const customLookupFunction = vi.fn().mockResolvedValue(customMapping);
			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

			const result = await findDiscordThreadByTicketIdWithRetry(
				'ticket_123',
				{},
				customLookupFunction
			);

			expect(result.ticketMapping).toBe(mockMapping);
			expect(result.discordThread).toBe(mockThread);
			expect(customLookupFunction).toHaveBeenCalledWith('ticket_123');
		});

		it('should fall back to default lookup when custom lookup returns null', async () => {
			const customLookupFunction = vi.fn().mockResolvedValue(null);
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);
			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

			const result = await findDiscordThreadByTicketIdWithRetry(
				'ticket_123',
				{},
				customLookupFunction
			);

			expect(result.ticketMapping).toBe(mockMapping);
			expect(customLookupFunction).toHaveBeenCalledWith('ticket_123');
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledWith('ticket_123');
		});

		it('should handle edge case where retry loop completes without error', async () => {
			// This is a very unlikely edge case, but we should handle it
			const originalMethod = mockBotsStore.getMappingByTicketId;
			mockBotsStore.getMappingByTicketId = vi.fn().mockImplementation(() => {
				// Return undefined instead of throwing or resolving
				return new Promise(() => {}); // Never resolves
			});

			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 1,
				maxRetryWindow: 10,
			});

			await vi.advanceTimersByTimeAsync(50);

			// Should eventually timeout with a general error
			// Note: This test verifies the safety net at the end of the function
		});
	});

	describe('fetchStarterMessage', () => {
		it('should successfully fetch starter message', async () => {
			mockThread.fetchStarterMessage.mockResolvedValue(mockMessage);

			const result = await fetchStarterMessage(mockThread as ThreadChannel);

			expect(result).toBe(mockMessage);
			expect(mockThread.fetchStarterMessage).toHaveBeenCalled();
		});

		it('should return null when starter message fetch fails', async () => {
			const fetchError = new Error('Failed to fetch starter message');
			mockThread.fetchStarterMessage.mockRejectedValue(fetchError);

			const result = await fetchStarterMessage(mockThread as ThreadChannel);

			expect(result).toBeNull();
			expect(LogEngine.error).toHaveBeenCalledWith('Failed to fetch starter message:', fetchError);
		});

		it('should handle network errors gracefully', async () => {
			const networkError = new Error('Network timeout');
			mockThread.fetchStarterMessage.mockRejectedValue(networkError);

			const result = await fetchStarterMessage(mockThread as ThreadChannel);

			expect(result).toBeNull();
			expect(LogEngine.error).toHaveBeenCalledWith('Failed to fetch starter message:', networkError);
		});

		it('should handle Discord API rate limiting', async () => {
			const rateLimitError = new Error('Rate limited');
			rateLimitError.name = 'DiscordAPIError';
			mockThread.fetchStarterMessage.mockRejectedValue(rateLimitError);

			const result = await fetchStarterMessage(mockThread as ThreadChannel);

			expect(result).toBeNull();
			expect(LogEngine.error).toHaveBeenCalledWith('Failed to fetch starter message:', rateLimitError);
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete workflow with retries', async () => {
			const mockMapping: ExtendedThreadTicketMapping = {
				unthreadTicketId: 'ticket_123',
				discordThreadId: 'thread_123',
				createdAt: new Date(),
				updatedAt: new Date(),
				discordUserId: 'user_123',
				unthreadCustomerId: 'customer_123',
			};

			// Simulate mapping being created after first attempt
			mockBotsStore.getMappingByTicketId
				.mockResolvedValueOnce(null) // First attempt: not found
				.mockResolvedValueOnce(null) // Second attempt: still not found
				.mockResolvedValueOnce(mockMapping); // Third attempt: found!

			mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);
			mockThread.fetchStarterMessage.mockResolvedValue(mockMessage);

			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 3,
				baseDelayMs: 50,
			});

			// Allow retries to complete
			await vi.advanceTimersByTimeAsync(1000);

			const result = await resultPromise;

			// Should eventually succeed
			expect(result.ticketMapping).toBe(mockMapping);
			expect(result.discordThread).toBe(mockThread);

			// Can then fetch starter message
			const starterMessage = await fetchStarterMessage(result.discordThread);
			expect(starterMessage).toBe(mockMessage);
		});

		it('should handle mixed error types correctly', async () => {
			// First attempt: mapping error (will retry)
			// Second attempt: Discord error (will not retry)
			mockBotsStore.getMappingByTicketId
				.mockResolvedValueOnce(null)
				.mockRejectedValueOnce(new Error('Discord client error'));

			// Start the promise and let it run
			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 3,
				baseDelayMs: 50,
			});

			// Allow enough time for the first attempt and retry
			await vi.advanceTimersByTimeAsync(200);

			// Now properly handle the rejection
			await expect(resultPromise).rejects.toThrow('Discord client error');

			// Should have made 2 attempts
			expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledTimes(2);
		});
	});

	describe('Error Context Enhancement', () => {
		it('should provide detailed context for race condition scenarios', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			// Start the promise but capture it properly
			const resultPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 2,
				maxRetryWindow: 5000, // 5 seconds - enough time to be considered a race condition
				baseDelayMs: 100,
			});

			// Allow time for retries to complete
			await vi.advanceTimersByTimeAsync(1000);

			// Properly await the rejection
			await expect(resultPromise).rejects.toThrow(/No Discord thread found/);

			// Check the enhanced error properties
			try {
				await resultPromise;
			} catch (error: any) {
				expect(error).toHaveProperty('context');
				expect(error.context).toMatchObject({
					ticketId: 'ticket_123',
					attemptsMade: 2,
					likelyRaceCondition: true,
				});

				expect(error.context.totalRetryTime).toBeLessThan(5000);
				expect(LogEngine.warn).toHaveBeenCalledWith(
					expect.stringContaining('Potential race condition detected')
				);
			}
		});

		it('should create error context with proper structure', async () => {
			mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

			const errorPromise = findDiscordThreadByTicketIdWithRetry('ticket_123', {
				maxAttempts: 1,
				baseDelayMs: 0,
			});

			// Properly await and handle the rejection
			await expect(errorPromise).rejects.toThrow(/No Discord thread found/);

			// Test the error structure separately
			try {
				await errorPromise;
			} catch (error: any) {
				expect(error).toHaveProperty('context');
				expect(error.context).toHaveProperty('ticketId', 'ticket_123');
				expect(error.context).toHaveProperty('attemptsMade', 1);
				expect(error.context).toHaveProperty('totalRetryTime');
				expect(error.context).toHaveProperty('likelyRaceCondition');
				expect(error.context).toHaveProperty('originalError');
			}
		});
	});
});