/**
 * Initialize Keyv with Redis
 * To be used as a database for caching with Keyv and caching with Cacheable.
 * @module src/utils/database
 */
const { createKeyv } = require('@keyv/redis');
const logger = require('./logger');
require("dotenv").config();

// Initialize Keyv with Redis
const keyv = createKeyv(process.env.REDIS_URL);

// Test Redis connection and log status
async function testRedisConnection() {
    try {
        // Test connection by setting and getting a test value
        const testKey = 'redis:connection:test';
        const testValue = Date.now().toString();
        
        await keyv.set(testKey, testValue, 1000); // 1 second TTL
        const retrievedValue = await keyv.get(testKey);
        
        if (retrievedValue === testValue) {
            logger.info('Successfully connected to Redis');
        } else {
            logger.warn('Redis connection test failed: value mismatch');
        }
    } catch (error) {
        logger.error('Redis connection error:', error.message);
    }
}

// Test connection when module loads
testRedisConnection();

// Handle any errors on the keyv instance
keyv.on('error', (error) => {
    logger.error('Redis error:', error.message);
});

module.exports = keyv;