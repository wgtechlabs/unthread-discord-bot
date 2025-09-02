/**
 * Thread Utilities Module - Updated for 3-Layer Architecture
 *
 * This module provides utility functions for working with Discord threads
 * and mapping them to Unthread tickets using the new BotsStore 3-layer storage system.
 *
 * The utilities consolidate common operations like finding threads by ticket ID and
 * error handling patterns, now leveraging the unified storage engine for improved
 * performance and reliability.
 *
 * These utilities help ensure consistent error handling and reduce code duplication
 * when performing common thread-related operations across the application.
 *
 * @module utils/threadUtils
 */

import { LogEngine } from '../config/logger';
import { ThreadChannel, Message } from 'discord.js';
import { BotsStore, ExtendedThreadTicketMapping } from '../sdk/bots-brain/BotsStore';

// Re-export interfaces for backward compatibility
export { ThreadTicketMapping } from '../types/discord';

/**
 * Custom error class for mapping not found scenarios
 *
 * This provides more precise error handling for cases where ticket mappings
 * are not found, allowing consumers to distinguish between mapping issues
 * and other types of errors.
 *
 * @example
 * ```typescript
 * try {
 *   await findThread(ticketId);
 * } catch (error) {
 *   if (error instanceof MappingNotFoundError) {
 *     console.log("Mapping not found, might be normal for external tickets");
 *   }
 * }
 * ```
 */
export class MappingNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MappingNotFoundError';
	}
}

/**
 * Enhanced error with additional context for debugging
 */
interface EnhancedError extends Error {
    /** Additional context about the error and retry attempts */
    context?: {
        /** The ticket ID that was being looked up */
        ticketId: string;
        /** Number of retry attempts made */
        attemptsMade: number;
        /** Total time spent retrying in milliseconds */
        totalRetryTime: number;
        /** Whether this appears to be a race condition */
        likelyRaceCondition: boolean;
        /** Original error message */
        originalError: string;
    };
}

/**
 * Configuration options for retry behavior
 */
interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Maximum time window for retries in milliseconds (default: 10000) */
    maxRetryWindow?: number;
    /** Base delay between retries in milliseconds (default: 1000) */
    baseDelayMs?: number;
}

/**
 * Fetches a Discord thread using an Unthread ticket ID with retry logic for race conditions
 *
 * This function extends findDiscordThreadByTicketId with intelligent retry logic to handle
 * edge cases where webhook events arrive before ticket mappings are fully propagated in storage.
 *
 * Common scenarios this handles:
 * - Storage propagation delays under high load
 * - Network hiccups during mapping creation
 * - Temporary storage system unavailability
 * - Webhooks arriving faster than expected from Unthread
 *
 * @param unthreadTicketId - Unthread ticket/conversation ID
 * @param lookupFunction - Function to lookup ticket mapping by Unthread ID
 * @param options - Retry configuration options
 * @returns Object containing mapping and thread
 * @throws {MappingNotFoundError} When ticket mapping not found after all retries
 * @throws {Error} When Discord API errors occur or thread is not accessible
 * @throws {Error} When lookup function fails for non-mapping reasons
 *
 * @example
 * ```typescript
 * try {
 *   const result = await findDiscordThreadByTicketIdWithRetry(
 *     'ticket123',
 *     getTicketByUnthreadTicketId,
 *     { maxAttempts: 5, maxRetryWindow: 15000 }
 *   );
 *   console.log(`Found thread: ${result.discordThread.id}`);
 * } catch (error) {
 *   if (error instanceof MappingNotFoundError) {
 *     console.log("Ticket mapping not found - likely external ticket");
 *   }
 * }
 * ```
 */
/**
 * Fetches a Discord thread using an Unthread ticket ID with retry logic for race conditions
 *
 * This function extends findDiscordThreadByTicketId with intelligent retry logic to handle
 * edge cases where webhook events arrive before ticket mappings are fully propagated in storage.
 *
 * Common scenarios this handles:
 * - Storage propagation delays under high load
 * - Network hiccups during mapping creation
 * - Temporary storage system unavailability
 *
 * @param unthreadTicketId - The Unthread ticket/conversation ID to search for
 * @param options - Configuration options for retry behavior
 * @returns Promise that resolves to thread result containing mapping and Discord thread
 * @throws {MappingNotFoundError} When no mapping exists after all retry attempts
 * @throws {Error} When Discord client is unavailable or thread cannot be fetched
 *
 * @example
 * ```typescript
 * try {
 *   const result = await findDiscordThreadByTicketIdWithRetry('ticket-123', {
 *     maxAttempts: 5,
 *     maxRetryWindow: 15000
 *   });
 *   console.log(`Found thread after retries: ${result.discordThread.name}`);
 * } catch (error) {
 *   if (error.context?.likelyRaceCondition) {
 *     console.log('Mapping likely exists but propagation was slower than expected');
 *   }
 * }
 * ```
 */
export async function findDiscordThreadByTicketIdWithRetry(
	unthreadTicketId: string,
	options: RetryOptions = {},
): Promise<{ ticketMapping: ExtendedThreadTicketMapping; discordThread: ThreadChannel }> {
	const {
		maxAttempts = 3,
		// 10 seconds
		maxRetryWindow = 10000,
		// 1 second
		baseDelayMs = 1000,
	} = options;

	const startTime = Date.now();
	let attemptsUsed = 0;
	let lastWasMappingError = false;
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		attemptsUsed = attempt;
		try {
			// Try the standard lookup using BotsStore
			return await findDiscordThreadByTicketId(unthreadTicketId);
		}
		catch (error: unknown) {
			lastError = error instanceof Error ? error : new Error('Unknown error');
			const timeSinceStart = Date.now() - startTime;

			// Check if this is a mapping error (our custom error type)
			lastWasMappingError = lastError instanceof MappingNotFoundError;

			// Only retry if:
			// 1. This is not the last attempt
			// 2. We're still within the retry window (for recent webhooks)
			// 3. The error is about missing mapping (not Discord API errors)
			const isLastAttempt = attempt === maxAttempts;
			const withinRetryWindow = timeSinceStart < maxRetryWindow;

			if (!isLastAttempt && withinRetryWindow && lastWasMappingError) {
				// Exponential backoff with jitter: base * 2^(attempt-1) + random jitter
				const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
				// 10% jitter
				const jitter = Math.random() * baseDelayMs * 0.1;
				// Cap at 5 seconds
				const delay = Math.min(exponentialDelay + jitter, 5000);

				LogEngine.debug(`Mapping not found for ticket ${unthreadTicketId}, attempt ${attempt}/${maxAttempts}. Retrying in ${Math.round(delay)}ms... (${timeSinceStart}ms since start)`);

				await new Promise(resolve => setTimeout(resolve, delay));
				continue;
			}

			// If we reach here, either this is the last attempt or we shouldn't retry
			break;
		}
	}

	// Enhance the final error with context about the retry attempts
	if (lastError) {
		const totalTime = Date.now() - startTime;
		const enhancedError = new Error(lastError.message, { cause: lastError }) as EnhancedError;
		enhancedError.context = {
			ticketId: unthreadTicketId,
			attemptsMade: attemptsUsed,
			totalRetryTime: totalTime,
			likelyRaceCondition: totalTime < maxRetryWindow && lastWasMappingError,
			originalError: lastError.message,
		};

		// Log with enhanced context
		if (enhancedError.context.likelyRaceCondition) {
			LogEngine.warn(`Potential race condition detected for ticket ${unthreadTicketId}: mapping not found after ${attemptsUsed} attempts over ${totalTime}ms`);
		}
		else {
			LogEngine.error(`Thread lookup failed for ticket ${unthreadTicketId} after ${attemptsUsed} attempts over ${totalTime}ms: ${lastError.message}`);
		}

		throw enhancedError;
	}

	// This should never happen, but TypeScript needs this
	throw new Error('Unexpected error: retry loop completed without result or error');
}

/**
 * Fetches a Discord thread using an Unthread ticket ID
 *
 * This function consolidates the common pattern of:
 * 1. Looking up a ticket mapping using an Unthread ticket ID
 * 2. Fetching the corresponding Discord thread
 * 3. Handling errors at each step with proper logging
 *
 * Using this function ensures consistent error handling and logging
 * throughout the application when threads need to be fetched.
 *
 * @param unthreadTicketId - Unthread ticket/conversation ID
 * @param lookupFunction - Function to lookup ticket mapping by Unthread ID
 * @returns Object containing mapping and thread
 * @throws {MappingNotFoundError} When no Discord thread mapping exists for ticket
 * @throws {Error} When Discord client is not initialized
 * @throws {Error} When Discord thread is not found or not accessible
 * @throws {Error} When channel exists but is not a thread type
 *
 * @example
 * ```typescript
 * try {
 *   const result = await findDiscordThreadByTicketId(
 *     'ticket123',
 *     getTicketByUnthreadTicketId
 *   );
 *   console.log(`Found thread: ${result.discordThread.name}`);
 * } catch (error) {
 *   console.error(`Thread lookup failed: ${error.message}`);
 * }
 * ```
 */
/**
 * Fetches a Discord thread using an Unthread ticket ID with BotsStore
 *
 * This function provides a simplified interface for finding Discord threads
 * by Unthread ticket ID using the new 3-layer storage architecture.
 *
 * @param unthreadTicketId - The Unthread ticket/conversation ID
 * @returns Promise that resolves to thread result containing mapping and Discord thread
 * @throws {MappingNotFoundError} When no mapping exists for the ticket ID
 * @throws {Error} When Discord client is unavailable or thread cannot be fetched
 *
 * @example
 * ```typescript
 * try {
 *   const result = await findDiscordThreadByTicketId('ticket-123');
 *   console.log(`Found thread: ${result.discordThread.name}`);
 * } catch (error) {
 *   if (error instanceof MappingNotFoundError) {
 *     console.log('No Discord thread exists for this ticket');
 *   }
 * }
 * ```
 */
export async function findDiscordThreadByTicketId(
	unthreadTicketId: string,
): Promise<{ ticketMapping: ExtendedThreadTicketMapping; discordThread: ThreadChannel }> {
	try {
		const botsStore = BotsStore.getInstance();

		// Get the ticket mapping using BotsStore (3-layer lookup)
		const ticketMapping = await botsStore.getMappingByTicketId(unthreadTicketId);
		if (!ticketMapping) {
			const error = new MappingNotFoundError(`No Discord thread found for Unthread ticket ${unthreadTicketId}`);
			LogEngine.error(error.message);
			throw error;
		}

		// Fetch the Discord thread
		const discordClient = (global as typeof globalThis).discordClient;
		if (!discordClient) {
			const error = new Error('Discord client is not initialized or unavailable.');
			LogEngine.error(error.message);
			throw error;
		}

		const channel = await discordClient.channels.fetch(ticketMapping.discordThreadId);
		if (!channel) {
			const error = new Error(`Discord thread with ID ${ticketMapping.discordThreadId} not found.`);
			LogEngine.error(error.message);
			throw error;
		}

		// Ensure the channel is actually a thread
		if (!channel.isThread()) {
			const error = new Error(`Discord channel with ID ${ticketMapping.discordThreadId} is not a thread.`);
			LogEngine.error(error.message);
			throw error;
		}

		LogEngine.debug(`Found Discord thread: ${channel.id}`);

		return {
			ticketMapping,
			discordThread: channel,
		};
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		LogEngine.error(`Error fetching Discord thread for ticket ${unthreadTicketId}: ${errorMessage}`);
		throw error;
	}
}

/**
 * Fetches the starter message of a thread reliably
 *
 * This function provides a clean way to get the original first message
 * that created a thread, which is more reliable than fetching recent messages.
 * For forum threads, this ensures we get the actual forum post content.
 *
 * @param thread - The Discord thread channel
 * @returns The starter message or null if not found
 * @throws Never throws - errors are logged and null is returned
 *
 * @example
 * ```typescript
 * const starterMessage = await fetchStarterMessage(threadChannel);
 * if (starterMessage) {
 *   console.log(`Thread started with: ${starterMessage.content}`);
 * } else {
 *   console.log("Could not fetch starter message");
 * }
 * ```
 */
export async function fetchStarterMessage(thread: ThreadChannel): Promise<Message | null> {
	try {
		// Use Discord.js built-in method for the starter message
		const starterMessage = await thread.fetchStarterMessage();
		return starterMessage;
	}
	catch (error) {
		LogEngine.error('Failed to fetch starter message:', error);
		return null;
	}
}