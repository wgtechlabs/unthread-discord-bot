/**
 * Retry Utility - Resilient Operation Execution
 * 
 * @description 
 * Provides configurable retry mechanisms for operations that may fail temporarily.
 * Supports both linear and exponential backoff strategies for various failure scenarios.
 * Essential for handling network operations, API calls, and database connections.
 * 
 * @module utils/retry
 * @since 1.0.0
 * 
 * @keyFunctions
 * - withRetry(): Executes operations with automatic retry logic and backoff
 * 
 * @commonIssues
 * - Infinite retry loops: Not setting reasonable maxAttempts limits
 * - Insufficient delay: Network operations need adequate retry intervals
 * - Missing operation names: Difficult to track specific failure points in logs
 * - Wrong backoff strategy: Linear vs exponential for different failure types
 * - Resource exhaustion: Too many concurrent retries overwhelming services
 * 
 * @troubleshooting
 * - Set maxAttempts to 3-5 for most network operations
 * - Use exponentialBackoff for high-load or rate-limited APIs
 * - Monitor LogEngine output for retry patterns and failure rates
 * - Adjust baseDelayMs based on operation type (API: 1000ms, DB: 500ms)
 * - Use descriptive operationName for better debugging
 * - Consider circuit breaker pattern for persistent failures
 * 
 * @performance
 * - Linear backoff: predictable timing, good for simple failures
 * - Exponential backoff: reduces load on struggling services
 * - Operation names enable targeted monitoring and optimization
 * - No memory leaks: proper cleanup on success or final failure
 * 
 * @dependencies LogEngine for structured logging
 * 
 * @example Basic Usage
 * ```typescript
 * const result = await withRetry(
 *   async () => fetch('https://api.example.com/data'),
 *   { operationName: 'API data fetch' }
 * );
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * // Database operation with exponential backoff
 * const dbResult = await withRetry(
 *   async () => database.query('SELECT * FROM users'),
 *   { 
 *     maxAttempts: 5,
 *     exponentialBackoff: true,
 *     operationName: 'User query'
 *   }
 * );
 * ```
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
 * Executes an operation with configurable retry logic and backoff strategies
 * 
 * @async
 * @function withRetry
 * @template T - Return type of the operation being retried
 * @param {() => Promise<T>} operation - Async function to execute with retry logic
 * @param {RetryOptions} [options={}] - Configuration for retry behavior and timing
 * @returns {Promise<T>} Result of the operation if successful within retry limits
 * @throws {Error} Aggregated error with all retry attempts if operation fails completely
 * 
 * @example
 * ```typescript
 * // API call with retry
 * const data = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   { operationName: 'API data fetch', maxAttempts: 3 }
 * );
 * ```
 * 
 * @troubleshooting
 * - Use exponentialBackoff for rate-limited APIs or high-load services
 * - Set appropriate maxAttempts: 3-5 for network, 2-3 for user operations
 * - Monitor logs for retry patterns indicating systemic issues
 * - Consider operation timeout alongside retry logic
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