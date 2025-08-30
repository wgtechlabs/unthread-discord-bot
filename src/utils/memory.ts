/**
 * Memory Cache Utility Module
 *
 * This module provides functions to interact with the in-memory cache system
 * backed by Redis for persistence. It serves as a simple key-value store for
 * temporarily persisting data throughout the bot's lifecycle, with configurable
 * expiration times.
 *
 * Requirements:
 * - Redis connection is required for proper functionality
 * - REDIS_URL environment variable must be set
 *
 * @module utils/memory
 */

import { CacheOperations } from '../types/discord';
import cachedData from './cache';

/**
 * Default TTL for cache entries (7 days in milliseconds)
 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sets a key-value pair in the cache with optional expiration time
 *
 * This function stores data in the cache with a configurable Time-To-Live (TTL).
 * Keys expire automatically after the TTL period, helping to prevent stale data issues.
 *
 * @param key - The unique identifier for storing the value
 * @param value - The value to store (will be serialized internally by the cache)
 * @param customTtl - Optional custom TTL in milliseconds (defaults to 7 days)
 * @returns A promise that resolves when the key is set
 *
 * @example
 * // Store a user's data for 1 hour (3600000 ms)
 * await setKey('user:123456789', userData, 3600000);
 *
 * @debug
 * If values aren't being stored properly, check:
 * 1. The cache implementation in cache.js for errors
 * 2. Whether the value is serializable
 * 3. Whether the key follows the expected format pattern
 * 4. Memory constraints if storing large objects
 */
async function setKey(key: string, value: unknown, customTtl?: number): Promise<void> {
	// Use custom TTL or default to 7 days for better memory management
	const ttl = customTtl ?? DEFAULT_TTL_MS;
	await cachedData.set(key, value, ttl);
}

/**
 * Sets a key-value pair with long-term persistence (3 years TTL)
 *
 * This function is specifically designed for data that needs long-term persistence,
 * such as ticket mappings, customer relationships, and audit trails.
 * Uses a 3-year TTL to balance storage costs with long-term access needs.
 *
 * @param key - The unique identifier for storing the value
 * @param value - The value to store (will be serialized internally by the cache)
 * @returns A promise that resolves when the key is set
 *
 * @example
 * // Store ticket mapping for 3 years
 * await setPersistentKey('ticket:discord:123', ticketMapping);
 *
 * // Store customer relationship for long-term access
 * await setPersistentKey('customer:456', customerData);
 */
async function setPersistentKey(key: string, value: unknown): Promise<void> {
	// 3 years TTL for long-term persistence
	// 94,608,000,000 ms
	const threeYearsTtl = 3 * 365 * 24 * 60 * 60 * 1000;
	await cachedData.set(key, value, threeYearsTtl);
}

/**
 * Retrieves a value from the cache by its key
 *
 * Fetches previously stored data from the cache if it exists and hasn't expired.
 * Returns null or undefined (depending on cache implementation) if the key doesn't exist
 * or has expired.
 *
 * @param key - The key to retrieve the value for
 * @returns A promise that resolves to the stored value, or null/undefined if not found
 *
 * @example
 * // Retrieve user data
 * const userData = await getKey('user:123456789');
 * if (userData) {
 *   // Use the cached data
 * } else {
 *   // Data not found or expired, fetch fresh data
 * }
 *
 * @debug
 * If expected values aren't being retrieved:
 * 1. Check if the key exactly matches what was used during setKey()
 * 2. Verify the TTL hasn't expired (default is 24 hours)
 * 3. Look for potential cache eviction in cache.js if memory limits are reached
 * 4. Confirm the value was successfully stored with setKey() in the first place
 */
async function getKey(key: string): Promise<unknown> {
	return await cachedData.get(key);
}

/**
 * Deletes a key from the cache
 *
 * @param key - The key to delete
 * @returns A promise that resolves when the key is deleted
 */
async function deleteKey(key: string): Promise<void> {
	await cachedData.delete(key);
}

/**
 * Memory cache operations
 */
const memoryCache: CacheOperations = {
	setKey,
	getKey,
	deleteKey,
	setPersistentKey,
};

export default memoryCache;

// Export individual functions for named imports
export { setKey, getKey, deleteKey, setPersistentKey };