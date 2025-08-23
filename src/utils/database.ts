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
 *
 * Environment Requirements:
 *   REDIS_URL - Redis connection string (e.g., redis://localhost:6379)
 *
 * @module utils/database
 */
import { createKeyv } from '@keyv/redis';
import { LogEngine } from '../config/logger';

/**
 * Redis Keyv Instance
 *
 * Creates and configures a Keyv instance connected to Redis.
 * This instance is used throughout the application for persistent data storage.
 */
const keyv = createKeyv(process.env.REDIS_URL);

/**
 * Tests the Redis connection and logs the result
 *
 * Performs a round-trip test by setting and retrieving a test value
 * to verify that Redis is properly connected and functioning.
 * This helps with debugging connection issues during startup.
 *
 * @async
 * @returns {Promise<void>}
 */
async function testRedisConnection(): Promise<void> {
    try {
        // Test connection by setting and getting a test value
        const testKey = 'redis:connection:test';
        const testValue = Date.now().toString();
        
        await keyv.set(testKey, testValue, 1000); // 1 second TTL
        const retrievedValue = await keyv.get(testKey);
        
        if (retrievedValue === testValue) {
            LogEngine.info('Successfully connected to Redis');
        } else {
            LogEngine.warn('Redis connection test failed: value mismatch');
        }
    } catch (error: any) {
        LogEngine.error('Redis connection error:', error.message);
    }
}

// Test connection when module loads
testRedisConnection();

/**
 * Redis Error Handler
 *
 * Handles Redis connection errors and logs them appropriately.
 * This helps with monitoring Redis health and debugging issues.
 */
keyv.on('error', (error: Error) => {
    LogEngine.error('Redis error:', error.message);
});

export default keyv;