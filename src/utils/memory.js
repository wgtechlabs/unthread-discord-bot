/**
 * This module provides functions to interact with the cache
 * @module utils/memory
 */
const cachedData = require('./cache');

/**
 * Set a key-value pair in the cache
 * @param {string} key - The key to set
 * @param {string} value - The value to set
 * @returns {Promise<boolean>} - A promise that resolves to true if the key was set, false otherwise
 */
async function setKey(key, value) {
    const ttl = 86400000; // 24 hours is the default TTL
    return await cachedData.set(key, value, ttl);
}

/**
 * Get a value from the cache
 * @param {string} key - The key to get
 * @returns {Promise<string>} - A promise that resolves to the value of the key
 */
async function getKey(key) {
    return await cachedData.get(key);
}

module.exports = { setKey, getKey };
