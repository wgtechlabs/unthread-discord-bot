/**
 * Cache Module
 *
 * Provides a caching layer using the Cacheable library with Redis persistence.
 * This module creates a central caching instance that can be used throughout
 * the application for storing and retrieving frequently accessed data.
 *
 * Features:
 * - In-memory caching with Redis persistence
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Required Redis storage for data persistence
 *
 * Usage:
 *   import cache from './utils/cache';
 *   await cache.set('key', 'value', 300000); // Cache for 5 minutes
 *   const value = await cache.get('key');
 *
 * Requirements:
 *   - Redis connection is required for proper functionality
 *   - REDIS_URL environment variable must be set
 *
 * @module utils/cache
 */
import { Cacheable } from 'cacheable';
import secondary from './database';

/**
 * Main cache instance with database backing
 *
 * Creates a Cacheable instance configured with secondary storage.
 * The secondary storage ensures cache persistence across application restarts.
 */
const cache = new Cacheable({ secondary });

export default cache;