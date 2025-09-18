/**
 * Unified Storage Engine - 3-Layer Data Persistence Architecture
 *
 * This module implements a sophisticated 3-layer storage system that provides
 * high-performance data access with automatic fallback capabilities:
 *
 * Layer 1 (L1): In-Memory Cache - Ultra-fast access for frequently used data
 * Layer 2 (L2): Redis Cache - Persistent cache across application restarts
 * Layer 3 (L3): PostgreSQL Database - Permanent storage and source of truth
 *
 * Data Flow:
 * READ:  Memory → Redis → PostgreSQL (first available wins)
 * WRITE: Memory ← Redis ← PostgreSQL (write-through to all layers)
 *
 * Features:
 * - Automatic cache warming and invalidation
 * - TTL support across all layers
 * - Fallback mechanisms for high availability
 * - Performance metrics and monitoring
 * - Type-safe operations with TypeScript
 *
 * @module sdk/bots-brain/UnifiedStorage
 */

import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';
import { LogEngine } from '../../config/logger';

/**
 * Storage layer interface for consistent operations across all layers
 */
interface StorageLayer {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear?(): Promise<void>;
    // New method for health checks
    ping(): Promise<boolean>;
}

/**
 * Storage operation result with metadata
 */
interface StorageResult<T = unknown> {
    data: T | null;
    found: boolean;
    layer: 'memory' | 'redis' | 'postgres';
    cacheHit: boolean;
    responseTime: number;
}

/**
 * Configuration for the unified storage system
 */
interface StorageConfig {
    redisCacheUrl: string;
    postgresUrl: string;
    defaultTtlSeconds: number;
    memoryMaxSize: number;
    enableMetrics: boolean;
}

/**
 * Memory storage layer (L1) - In-memory cache with LRU eviction
 */
class MemoryStorage implements StorageLayer {
	private cache: Map<string, { value: unknown; expires?: number }>;
	private readonly maxSize: number;

	constructor(maxSize: number = 1000) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	async get(key: string): Promise<unknown> {
		const entry = this.cache.get(key);

		if (!entry) {
			return null;
		}

		// Check expiration
		if (entry.expires && Date.now() > entry.expires) {
			this.cache.delete(key);
			return null;
		}

		// Move to end for LRU
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		// Implement LRU eviction
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}

		const entry: { value: unknown; expires?: number } = { value };
		if (ttlSeconds) {
			entry.expires = Date.now() + (ttlSeconds * 1000);
		}
		this.cache.set(key, entry);
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	async exists(key: string): Promise<boolean> {
		const entry = this.cache.get(key);
		if (!entry) return false;

		if (entry.expires && Date.now() > entry.expires) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		this.cache.clear();
	}

	async ping(): Promise<boolean> {
		try {
			// Memory storage is always available if the object exists
			return true;
		}
		catch {
			return false;
		}
	}

	getSize(): number {
		return this.cache.size;
	}
}

/**
 * Redis storage layer (L2) - Distributed cache with persistence
 */
class RedisStorage implements StorageLayer {
	private client: RedisClientType;
	private connected: boolean = false;

	constructor(redisUrl: string) {
		this.client = createClient({ url: redisUrl });
		this.initializeConnection();
	}

	private async initializeConnection(): Promise<void> {
		try {
			this.client.on('connect', () => {
				this.connected = true;
				LogEngine.info('Redis L2 cache connected successfully');
			});

			this.client.on('error', (error: Error) => {
				this.connected = false;
				LogEngine.error('Redis L2 cache error:', error);
			});

			await this.client.connect();
			await this.client.ping();
		}
		catch (error) {
			LogEngine.error('Failed to initialize Redis L2 cache:', error);
			this.connected = false;
		}
	}

	async get(key: string): Promise<unknown> {
		if (!this.connected) return null;

		try {
			const value = await this.client.get(key);
			return value ? JSON.parse(value) : null;
		}
		catch (error) {
			LogEngine.error('Redis L2 get error:', error);
			return null;
		}
	}

	async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		if (!this.connected) return;

		try {
			const serialized = JSON.stringify(value);
			if (ttlSeconds) {
				await this.client.setEx(key, ttlSeconds, serialized);
			}
			else {
				await this.client.set(key, serialized);
			}
		}
		catch (error) {
			LogEngine.error('Redis L2 set error:', error);
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.connected) return;

		try {
			await this.client.del(key);
		}
		catch (error) {
			LogEngine.error('Redis L2 delete error:', error);
		}
	}

	async exists(key: string): Promise<boolean> {
		if (!this.connected) return false;

		try {
			const exists = await this.client.exists(key);
			return exists === 1;
		}
		catch (error) {
			LogEngine.error('Redis L2 exists error:', error);
			return false;
		}
	}

	async ping(): Promise<boolean> {
		if (!this.connected) return false;

		try {
			const result = await this.client.ping();
			return result === 'PONG';
		}
		catch (error) {
			LogEngine.error('Redis L2 ping error:', error);
			return false;
		}
	}
}

/**
 * PostgreSQL storage layer (L3) - Permanent database storage
 */
class PostgresStorage implements StorageLayer {
	private pool: Pool;
	private connected: boolean = false;

	constructor(postgresUrl: string) {
		this.pool = new Pool({
			connectionString: postgresUrl,
			max: 10,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
		});
		this.initializeConnection();
	}

	private async initializeConnection(): Promise<void> {
		try {
			const client = await this.pool.connect();
			await client.query('SELECT 1');
			client.release();
			this.connected = true;
			LogEngine.info('PostgreSQL L3 storage connected successfully');
		}
		catch (error) {
			LogEngine.error('Failed to initialize PostgreSQL L3 storage:', error);
			this.connected = false;
		}
	}

	async get(key: string): Promise<unknown> {
		if (!this.connected) return null;

		let client;
		try {
			client = await this.pool.connect();
			try {
				const result = await client.query(
					'SELECT data FROM storage_cache WHERE cache_key = $1 AND (expires_at IS NULL OR expires_at > NOW())',
					[key],
				);
				return result.rows.length > 0 ? result.rows[0].data : null;
			}
			finally {
				client.release();
			}
		}
		catch (error) {
			LogEngine.error('PostgreSQL L3 get error:', error);
			return null;
		}
	}

	async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		if (!this.connected) return;

		let client;
		try {
			client = await this.pool.connect();
			try {
				const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;

				if (expiresAt !== null) {
					await client.query(`
						INSERT INTO storage_cache (cache_key, data, expires_at) 
						VALUES ($1, $2, $3)
						ON CONFLICT (cache_key) 
						DO UPDATE SET data = $2, expires_at = $3, updated_at = NOW()
					`, [key, JSON.stringify(value), expiresAt]);
				}
				else {
					await client.query(`
						INSERT INTO storage_cache (cache_key, data, expires_at) 
						VALUES ($1, $2, NULL)
						ON CONFLICT (cache_key) 
						DO UPDATE SET data = $2, expires_at = NULL, updated_at = NOW()
					`, [key, JSON.stringify(value)]);
				}
			}
			finally {
				client.release();
			}
		}
		catch (error) {
			LogEngine.error('PostgreSQL L3 set error:', error);
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.connected) return;

		let client;
		try {
			client = await this.pool.connect();
			try {
				await client.query('DELETE FROM storage_cache WHERE cache_key = $1', [key]);
			}
			finally {
				client.release();
			}
		}
		catch (error) {
			LogEngine.error('PostgreSQL L3 delete error:', error);
		}
	}

	async exists(key: string): Promise<boolean> {
		if (!this.connected) return false;

		let client;
		try {
			client = await this.pool.connect();
			try {
				const result = await client.query(
					'SELECT 1 FROM storage_cache WHERE cache_key = $1 AND (expires_at IS NULL OR expires_at > NOW())',
					[key],
				);
				return result.rows.length > 0;
			}
			finally {
				client.release();
			}
		}
		catch (error) {
			LogEngine.error('PostgreSQL L3 exists error:', error);
			return false;
		}
	}

	async ping(): Promise<boolean> {
		let client;
		try {
			client = await this.pool.connect();
			try {
				await client.query('SELECT 1');
				LogEngine.debug('PostgreSQL L3 ping successful');
				return true;
			}
			finally {
				client.release();
			}
		}
		catch (error) {
			LogEngine.error('PostgreSQL L3 ping error:', error instanceof Error ? error.message : String(error));
			return false;
		}
	}
}

/**
 * Unified Storage Engine - Main class implementing 3-layer architecture
 */
export class UnifiedStorage {
	private l1Memory: MemoryStorage;
	private l2Redis: RedisStorage;
	private l3Postgres: PostgresStorage;
	private config: StorageConfig;
	private metrics: Map<string, number> = new Map();

	constructor(config: StorageConfig) {
		this.config = config;
		this.l1Memory = new MemoryStorage(config.memoryMaxSize);
		this.l2Redis = new RedisStorage(config.redisCacheUrl);
		this.l3Postgres = new PostgresStorage(config.postgresUrl);

		LogEngine.info('UnifiedStorage initialized with 3-layer architecture');
	}

	/**
     * Get data with automatic layer fallback
     */
	async get<T = unknown>(key: string): Promise<StorageResult<T>> {
		const startTime = Date.now();

		// Try L1 (Memory) first
		let data = await this.l1Memory.get(key);
		if (data !== null) {
			this.updateMetrics('l1_hits');
			return {
				data: data as T,
				found: true,
				layer: 'memory',
				cacheHit: true,
				responseTime: Date.now() - startTime,
			};
		}

		// Try L2 (Redis) second
		data = await this.l2Redis.get(key);
		if (data !== null) {
			// Warm L1 cache
			await this.l1Memory.set(key, data, this.config.defaultTtlSeconds);
			this.updateMetrics('l2_hits');
			return {
				data: data as T,
				found: true,
				layer: 'redis',
				cacheHit: true,
				responseTime: Date.now() - startTime,
			};
		}

		// Try L3 (PostgreSQL) last
		data = await this.l3Postgres.get(key);
		if (data !== null) {
			// Warm both L1 and L2 caches
			await Promise.all([
				this.l1Memory.set(key, data, this.config.defaultTtlSeconds),
				this.l2Redis.set(key, data, this.config.defaultTtlSeconds),
			]);
			this.updateMetrics('l3_hits');
			return {
				data: data as T,
				found: true,
				layer: 'postgres',
				cacheHit: false,
				responseTime: Date.now() - startTime,
			};
		}

		this.updateMetrics('cache_misses');
		return {
			data: null,
			found: false,
			layer: 'postgres',
			cacheHit: false,
			responseTime: Date.now() - startTime,
		};
	}

	/**
     * Set data across all layers (write-through)
     */
	async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		const ttl = ttlSeconds || this.config.defaultTtlSeconds;

		// 1) Persist to L3 (source of truth) first
		await this.l3Postgres.set(key, value, ttl);

		// 2) Best-effort cache warm - tolerate cache failures
		await Promise.allSettled([
			this.l1Memory.set(key, value, ttl),
			this.l2Redis.set(key, value, ttl),
		]);

		this.updateMetrics('writes');
	}

	/**
     * Delete data from all layers
     */
	async delete(key: string): Promise<void> {
		// Use allSettled to avoid bubbling cache errors during deletion
		await Promise.allSettled([
			this.l1Memory.delete(key),
			this.l2Redis.delete(key),
			this.l3Postgres.delete(key),
		]);

		this.updateMetrics('deletes');
	}

	/**
     * Check if key exists in any layer
     */
	async exists(key: string): Promise<boolean> {
		// Check in order of performance
		return await this.l1Memory.exists(key) ||
               await this.l2Redis.exists(key) ||
               await this.l3Postgres.exists(key);
	}

	/**
     * Clear all cache layers (use with caution)
     */
	async clear(): Promise<void> {
		await Promise.all([
			this.l1Memory.clear?.(),
			// Note: Not clearing Redis/Postgres as they may contain critical data
		]);

		LogEngine.warn('Memory cache (L1) cleared - Redis and PostgreSQL preserved');
	}

	/**
     * Get storage metrics
     */
	getMetrics(): Record<string, number> {
		const metrics = Object.fromEntries(this.metrics);
		return {
			...metrics,
			l1_memory_size: this.l1Memory.getSize(),
			cache_hit_ratio: this.calculateHitRatio(),
		};
	}

	private updateMetrics(operation: string): void {
		if (!this.config.enableMetrics) return;

		const current = this.metrics.get(operation) || 0;
		this.metrics.set(operation, current + 1);
	}

	private calculateHitRatio(): number {
		const hits = (this.metrics.get('l1_hits') || 0) +
                    (this.metrics.get('l2_hits') || 0) +
                    (this.metrics.get('l3_hits') || 0);
		const misses = this.metrics.get('cache_misses') || 0;
		const total = hits + misses;

		return total > 0 ? (hits / total) * 100 : 0;
	}

	/**
     * Health check for all storage layers
     *
     * Now uses proper ping() methods to actually test connectivity
     * instead of relying on Promise.allSettled which reports "fulfilled"
     * even when operations fail.
     */
	async healthCheck(): Promise<Record<string, boolean>> {
		const results = await Promise.allSettled([
			this.l1Memory.ping(),
			this.l2Redis.ping(),
			this.l3Postgres.ping(),
		]);

		return {
			memory: results[0].status === 'fulfilled' && results[0].value === true,
			redis: results[1].status === 'fulfilled' && results[1].value === true,
			postgres: results[2].status === 'fulfilled' && results[2].value === true,
		};
	}
}