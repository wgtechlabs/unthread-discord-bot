/**
 * Database Module - Redis Integration
 *
 * Initializes and manages the Redis database connection using Keyv.
 * This module provides persistent storage for caching and data persistence
 * across application restarts and serves as the secondary storage for
 * the Cacheable library.
 *
 * Features:
 * - Redis connection management with Keyv
 * - Connection health monitoring
 * - Automatic error handling and logging
 * - TTL (Time To Live) support for data expiration
 * - Required Redis connection for application startup
 *
 * Environment Requirements:
 *   REDIS_URL - Redis connection string (REQUIRED, e.g., redis://localhost:6379)
 *
 * @module utils/database
 */
import { createKeyv } from '@keyv/redis';
import { LogEngine } from '../config/logger';

// Ensure Redis URL is provided
if (!process.env.REDIS_URL) {
	LogEngine.error('REDIS_URL environment variable is required but not set');
	LogEngine.error('Please provide a valid Redis connection URL (e.g., redis://localhost:6379)');
	throw new Error('Missing required REDIS_URL environment variable');
}

/**
 * Redis Keyv Instance
 *
 * Creates and configures a Keyv instance connected to Redis.
 * This instance is used throughout the application for persistent data storage.
 * The connection is required and will throw an error if REDIS_URL is not provided.
 */
const keyv = createKeyv(process.env.REDIS_URL);

/**
 * Tests the Redis connection and logs the result
 *
 * Performs a round-trip test by setting and retrieving a test value
 * to verify that Redis is properly connected and functioning.
 * This function will throw an error if Redis connection fails,
 * ensuring the application doesn't start with a broken cache.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If Redis connection test fails
 */
async function testRedisConnection(): Promise<void> {
	try {
		// Test connection by setting and getting a test value
		const testKey = 'redis:connection:test';
		const testValue = Date.now().toString();

		// 1 second TTL
		await keyv.set(testKey, testValue, 1000);
		const retrievedValue = await keyv.get(testKey);

		if (retrievedValue === testValue) {
			LogEngine.info('Successfully connected to Redis');
		}
		else {
			const errorMessage = 'Redis connection test failed: value mismatch';
			LogEngine.error(errorMessage);
			throw new Error(errorMessage);
		}
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		LogEngine.error('Redis connection error:', errorMessage);
		LogEngine.error('Application cannot start without a working Redis connection');
		throw new Error(`Redis connection failed: ${errorMessage}`);
	}
}

// Test connection when module loads
testRedisConnection();

/**
 * Redis Error Handler
 *
 * Handles Redis connection errors and logs them appropriately.
 * Since Redis is now required, connection errors are treated as critical.
 * This helps with monitoring Redis health and debugging issues.
 */
keyv.on('error', (error: Error) => {
	LogEngine.error('Critical Redis error occurred:', error.message);
	LogEngine.error('Redis connection is required for application functionality');
	// Note: In production, you might want to implement reconnection logic here
});

export default keyv;
export { testRedisConnection };