const { createKeyv } = require('@keyv/redis');
require("dotenv").config();

// Initialize Keyv with Redis
const keyv = createKeyv(process.env.REDIS_URL);

module.exports = keyv;