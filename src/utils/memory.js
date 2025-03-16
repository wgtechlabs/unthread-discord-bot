const cachedData = require('./cache');

async function setKey(key, value) {
    const ttl = 86400000; // 24 hours is the default TTL
    return await cachedData.set(key, value, ttl);
}

async function getKey(key) {
    return await cachedData.get(key);
}

module.exports = { setKey, getKey };
