/**
 * Retry Utility Module
 *
 * This module provides a simple retry mechanism for operations that may fail temporarily.
 * It uses a linear backoff strategy with configurable attempts and delay.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This utility is used throughout the codebase for API calls, database operations,
 * and other potentially flaky operations. Understanding retry patterns helps
 * with debugging intermittent failures.
 *
 * 💡 BEST PRACTICES:
 * =================
 * - Use for network operations (API calls, database queries)
 * - Avoid for user-facing operations that need immediate response
 * - Set reasonable maxAttempts (3-5 for most cases)
 * - Use descriptive operationName for better logging
 * - Consider exponential backoff for high-load scenarios
 *
 * 🔧 DEBUGGING TIPS:
 * =================
 * - Check logs for retry attempt patterns
 * - Monitor failure rates to identify systemic issues
 * - Adjust retry parameters based on operation type
 * - Use operation names to track specific failure points
 *
 * @module utils/retry
 */

import { LogEngine } from '../config/logger';

/**
 * Retry operation configuration options
 */
interface RetryOptions {
	maxAttempts?: number;
	baseDelayMs?: number;
	operationName?: string;
	exponentialBackoff?: boolean;
}

/**
 * Executes an operation with retry logic
 *
 * @param operation - Async function to execute with retry logic
 * @param options - Configuration options for retry behavior
 * @returns Result of the operation if successful
 * @throws Error if all retry attempts fail
 *
 * @example
 * // Fetch data with retry using linear backoff
 * const result = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error('API request failed');
 *     return await response.json();
 *   },
 *   { operationName: 'API data fetch' }
 * );
 *
 * // Critical operation with exponential backoff
 * await withRetry(
 *   async () => await deployCommands(),
 *   {
 *     operationName: 'Discord command deployment',
 *     exponentialBackoff: true,
 *     maxAttempts: 3
 *   }
 * );
 */
async function withRetry<T>(
	operation: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const {
		maxAttempts = 5,
		baseDelayMs = 3000,
		operationName = 'operation',
		exponentialBackoff = false,
	} = options;

	let attempt = 0;
	let lastError: Error | null = null;

	while (attempt < maxAttempts) {
		try {
			LogEngine.info(`Attempt ${attempt + 1}/${maxAttempts} for ${operationName}...`);

			// Execute the operation
			const result = await operation();

			// If we get here, the operation succeeded
			if (attempt > 0) {
				LogEngine.info(`${operationName} succeeded on attempt ${attempt + 1}`);
			}

			return result;
		}
		catch (error) {
			lastError = error as Error;
			LogEngine.debug(`Attempt ${attempt + 1} failed: ${lastError.message}`);

			if (attempt < maxAttempts - 1) {
				// Calculate delay with linear or exponential backoff
				const delayMs = exponentialBackoff
					? baseDelayMs * Math.pow(2, attempt)
					: baseDelayMs * (attempt + 1);
				LogEngine.info(`Retrying in ${delayMs / 1000}s... (attempt ${attempt + 1}/${maxAttempts})`);
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}

		attempt++;
	}

	// If we get here, all attempts failed
	LogEngine.error(`${operationName} failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
	throw new Error(`${operationName} failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`, { cause: lastError ?? undefined });
}

/**
 * Retry utility functions
 */
const retryUtils = {
	withRetry,
};

export default retryUtils;

// Export individual functions for named imports
export { withRetry };