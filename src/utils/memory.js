/**
 * Memory Cache Utility Module
 * 
 * This module provides functions to interact with the in-memory cache system.
 * It serves as a simple key-value store for temporarily persisting data throughout
 * the bot's lifecycle, with configurable expiration times.
 * 
 * @module utils/memory
 * @requires ./cache - The underlying cache implementation
 */
const cachedData = require('./cache');

/**
 * Sets a key-value pair in the cache with optional expiration time
 * 
 * This function stores data in the cache with a configurable Time-To-Live (TTL).
 * Keys expire automatically after the TTL period, helping to prevent stale data issues.
 * 
 * @param {string} key - The unique identifier for storing the value
 * @param {*} value - The value to store (will be serialized internally by the cache)
 * @param {number} [customTtl=86400000] - Optional custom TTL in milliseconds (defaults to 24 hours)
 * @returns {Promise<boolean>} - A promise that resolves to true if the key was set, false if operation failed
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
async function setKey(key, value, customTtl) {
    const ttl = customTtl || 86400000; // Use custom TTL or default to 24 hours
    return await cachedData.set(key, value, ttl);
}

/**
 * Retrieves a value from the cache by its key
 * 
 * Fetches previously stored data from the cache if it exists and hasn't expired.
 * Returns null or undefined (depending on cache implementation) if the key doesn't exist
 * or has expired.
 * 
 * @param {string} key - The key to retrieve the value for
 * @returns {Promise<*>} - A promise that resolves to the stored value, or null/undefined if not found
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
async function getKey(key) {
    return await cachedData.get(key);
}

module.exports = { setKey, getKey };
