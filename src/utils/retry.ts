/**
 * Retry Utility Module
 *
 * This module provides a simple retry mechanism for operations that may fail temporarily.
 * It uses a linear backoff strategy with configurable attempts and delay.
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
 * // Fetch data with retry
 * const result = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error('API request failed');
 *     return await response.json();
 *   },
 *   { operationName: 'API data fetch' }
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
				// Calculate delay with linear backoff
				const delayMs = baseDelayMs * (attempt + 1);
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