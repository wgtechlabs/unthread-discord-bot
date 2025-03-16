/**
 * This file is responsible for creating a new instance of the Cacheable class and exporting it.
 * Also it uses the secondary database to store the cache data.
 * @module utils/cache
 */
const { Cacheable } = require('cacheable');
const secondary = require('./database');

const cache = new Cacheable({ secondary });

module.exports = cache;