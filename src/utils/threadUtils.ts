/**
 * Thread Utilities Module
 *
 * This module provides utility functions for working with Discord threads
 * and mapping them to Unthread tickets. The utilities consolidate common
 * operations like finding threads by ticket ID and error handling patterns.
 *
 * These utilities help ensure consistent error handling and reduce code duplication
 * when performing common thread-related operations across the application.
 */

import { LogEngine } from '../config/logger';
import { ThreadChannel } from 'discord.js';

interface TicketMapping {
    discordThreadId: string;
    unthreadTicketId: string;
}

interface ThreadResult {
    ticketMapping: TicketMapping;
    discordThread: ThreadChannel;
}

interface EnhancedError extends Error {
    context?: {
        ticketId: string;
        attemptsMade: number;
        totalRetryTime: number;
        likelyRaceCondition: boolean;
        originalError: string;
    };
}

interface RetryOptions {
    maxAttempts?: number;
    maxRetryWindow?: number;
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
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @param {Function} lookupFunction - Function to lookup ticket mapping by Unthread ID
 * @param {RetryOptions} options - Retry configuration options
 * @returns {Promise<ThreadResult>} - Object containing mapping and thread
 * @throws {Error} - If thread not found after all retries or other error occurs
 */
export async function findDiscordThreadByTicketIdWithRetry(
	unthreadTicketId: string,
	lookupFunction: (id: string) => Promise<TicketMapping | null>,
	options: RetryOptions = {},
): Promise<ThreadResult> {
	const {
		maxAttempts = 3,
		// 10 seconds
		maxRetryWindow = 10000,
		// 1 second
		baseDelayMs = 1000,
	} = options;

	const startTime = Date.now();
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			// Try the standard lookup
			return await findDiscordThreadByTicketId(unthreadTicketId, lookupFunction);
		}
		catch (error: unknown) {
			lastError = error instanceof Error ? error : new Error('Unknown error');
			const timeSinceStart = Date.now() - startTime;

			// Only retry if:
			// 1. This is not the last attempt
			// 2. We're still within the retry window (for recent webhooks)
			// 3. The error is about missing mapping (not Discord API errors)
			const isLastAttempt = attempt === maxAttempts;
			const withinRetryWindow = timeSinceStart < maxRetryWindow;
			const isMappingError = lastError.message.includes('No Discord thread found for Unthread ticket');

			if (!isLastAttempt && withinRetryWindow && isMappingError) {
				// Progressive delay: 1s, 2s, 3s
				const delay = baseDelayMs * attempt;
				LogEngine.debug(`Mapping not found for ticket ${unthreadTicketId}, attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms... (${timeSinceStart}ms since start)`);

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
			attemptsMade: maxAttempts,
			totalRetryTime: totalTime,
			likelyRaceCondition: totalTime < maxRetryWindow,
			originalError: lastError.message,
		};

		// Log with enhanced context
		if (enhancedError.context.likelyRaceCondition) {
			LogEngine.warn(`Potential race condition detected for ticket ${unthreadTicketId}: mapping not found after ${maxAttempts} attempts over ${totalTime}ms`);
		}
		else {
			LogEngine.error(`Ticket mapping genuinely missing for ${unthreadTicketId} (checked after ${totalTime}ms)`);
		}

		throw enhancedError;
	}

	// This should never happen, but just in case
	throw new Error(`Unexpected error in retry logic for ticket ${unthreadTicketId}`);
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
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @param {Function} lookupFunction - Function to lookup ticket mapping by Unthread ID
 * @returns {Promise<ThreadResult>} - Object containing mapping and thread
 * @throws {Error} - If thread not found or other error occurs
 */
export async function findDiscordThreadByTicketId(
	unthreadTicketId: string,
	lookupFunction: (id: string) => Promise<TicketMapping | null>,
): Promise<ThreadResult> {
	// Get the ticket mapping using the provided lookup function
	// This allows the function to work with different storage mechanisms
	const ticketMapping = await lookupFunction(unthreadTicketId);
	if (!ticketMapping) {
		const error = new Error(`No Discord thread found for Unthread ticket ${unthreadTicketId}`);
		LogEngine.error(error.message);
		throw error;
	}

	// Fetch the Discord thread
	try {
		const channel = await (global as typeof globalThis).discordClient?.channels.fetch(ticketMapping.discordThreadId);
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