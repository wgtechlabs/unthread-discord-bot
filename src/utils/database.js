/**
 * Initialize Keyv with Redis
 * To be used as a database for caching with Keyv and caching with Cacheable.
 * @module src/utils/database
 */
const { createKeyv } = require('@keyv/redis');
require("dotenv").config();

// Initialize Keyv with Redis
const keyv = createKeyv(process.env.REDIS_URL);

module.exports = keyv;