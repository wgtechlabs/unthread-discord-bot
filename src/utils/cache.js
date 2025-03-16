const { Cacheable } = require('cacheable');
const { keyv: secondary } = require('./database');

const cache = new Cacheable({secondary});

module.exports = cache;