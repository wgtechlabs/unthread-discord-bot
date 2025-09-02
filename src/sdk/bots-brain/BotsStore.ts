/**
 * BotsStore - Discord-Specific Storage Operations
 *
 * This module provides high-level storage operations specifically designed for
 * Discord bot functionality, built on top of the UnifiedStorage engine.
 *
 * Features:
 * - Customer management with Discord integration
 * - Thread-ticket mapping persistence
 * - High-performance caching for frequently accessed data
 * - Type-safe operations with full TypeScript support
 * - Automatic cache warming and invalidation
 *
 * Storage Keys Pattern:
 * - customer:discord:{discordId} - Customer data by Discord ID
 * - customer:unthread:{unthreadId} - Customer data by Unthread ID
 * - mapping:thread:{threadId} - Thread-ticket mapping by Discord thread ID
 * - mapping:ticket:{ticketId} - Thread-ticket mapping by Unthread ticket ID
 * - bot:config:{key} - Bot configuration data
 *
 * @module sdk/bots-brain/BotsStore
 */

import { User } from 'discord.js';
import { Pool } from 'pg';
import { UnifiedStorage } from './UnifiedStorage';
import { LogEngine } from '../../config/logger';
import { ThreadTicketMapping } from '../../types/discord';

/**
 * Customer data structure for Discord users
 */
export interface Customer {
    id?: number;
    discordId: string;
    unthreadCustomerId?: string;
    email?: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Extended thread-ticket mapping with additional metadata
 */
export interface ExtendedThreadTicketMapping extends ThreadTicketMapping {
    id?: number;
    discordChannelId?: string;
    customerId?: number;
    status: 'active' | 'closed' | 'archived';
    updatedAt?: Date;
}

/**
 * Bot configuration storage interface
 */
export interface BotConfig {
    key: string;
    value: unknown;
    expiresAt?: Date;
}

/**
 * BotsStore configuration
 */
interface BotsStoreConfig {
    databaseUrl: string;
    redisCacheUrl: string;
    defaultCacheTtl: number;
    enableMetrics: boolean;
}

/**
 * Main BotsStore class providing Discord-specific storage operations
 */
export class BotsStore {
	private static instance: BotsStore;
	private storage: UnifiedStorage;
	private pool: Pool;
	private config: BotsStoreConfig;

	private constructor(config: BotsStoreConfig) {
		this.config = config;

		// Initialize UnifiedStorage
		this.storage = new UnifiedStorage({
			redisCacheUrl: config.redisCacheUrl,
			databaseUrl: config.databaseUrl,
			defaultTtlSeconds: config.defaultCacheTtl,
			memoryMaxSize: 1000,
			enableMetrics: config.enableMetrics,
		});

		// Initialize direct database pool for complex queries
		this.pool = new Pool({
			connectionString: config.databaseUrl,
			max: 10,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
		});

		LogEngine.info('BotsStore initialized with UnifiedStorage backend');
	}

	/**
     * Get or create singleton instance
     */
	public static getInstance(config?: BotsStoreConfig): BotsStore {
		if (!BotsStore.instance) {
			if (!config) {
				throw new Error('BotsStore config required for first initialization');
			}
			BotsStore.instance = new BotsStore(config);
		}
		return BotsStore.instance;
	}

	/**
     * Initialize BotsStore with environment configuration
     */
	public static async initialize(): Promise<BotsStore> {
		const config: BotsStoreConfig = {
			databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/unthread_discord_bot',
			redisCacheUrl: process.env.REDIS_CACHE_URL || 'redis://localhost:6379',
			// 1 hour default cache
			defaultCacheTtl: 3600,
			enableMetrics: process.env.DEBUG_MODE === 'true',
		};

		const store = BotsStore.getInstance(config);
		await store.healthCheck();
		return store;
	}

	// ==================== CUSTOMER OPERATIONS ====================

	/**
     * Store or update customer data
     */
	async storeCustomer(user: User, email?: string, unthreadCustomerId?: string): Promise<Customer> {
		const customer: Partial<Customer> = {
			discordId: user.id,
			username: user.username,
			displayName: user.displayName || user.globalName || user.username,
			avatarUrl: user.displayAvatarURL(),
		};

		if (unthreadCustomerId) {
			customer.unthreadCustomerId = unthreadCustomerId;
		}
		if (email) {
			customer.email = email;
		}

		try {
			const client = await this.pool.connect();

			const result = await client.query(`
                INSERT INTO customers (discord_id, unthread_customer_id, email, username, display_name, avatar_url)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (discord_id)
                DO UPDATE SET 
                    unthread_customer_id = COALESCE($2, customers.unthread_customer_id),
                    email = COALESCE($3, customers.email),
                    username = $4,
                    display_name = $5,
                    avatar_url = $6,
                    updated_at = NOW()
                RETURNING *
            `, [
				customer.discordId,
				customer.unthreadCustomerId || null,
				customer.email || null,
				customer.username,
				customer.displayName,
				customer.avatarUrl,
			]);

			client.release();

			const storedCustomer = result.rows[0] as Customer;

			// Cache in all storage layers
			const cacheKey = `customer:discord:${user.id}`;
			await this.storage.set(cacheKey, storedCustomer, this.config.defaultCacheTtl);

			if (unthreadCustomerId) {
				const unthreadCacheKey = `customer:unthread:${unthreadCustomerId}`;
				await this.storage.set(unthreadCacheKey, storedCustomer, this.config.defaultCacheTtl);
			}

			LogEngine.debug(`Customer stored/updated: ${user.username} (${user.id})`);
			return storedCustomer;

		}
		catch (error) {
			LogEngine.error('Error storing customer:', error);
			throw new Error(`Failed to store customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
     * Get customer by Discord ID
     */
	async getCustomerByDiscordId(discordId: string): Promise<Customer | null> {
		const cacheKey = `customer:discord:${discordId}`;

		// Try cache first
		const cached = await this.storage.get<Customer>(cacheKey);
		if (cached.found && cached.data) {
			LogEngine.debug(`Customer found in cache (${cached.layer}): ${discordId}`);
			return cached.data;
		}

		// Query database
		try {
			const client = await this.pool.connect();
			const result = await client.query(
				'SELECT * FROM customers WHERE discord_id = $1',
				[discordId],
			);
			client.release();

			if (result.rows.length === 0) {
				return null;
			}

			const customer = result.rows[0] as Customer;

			// Warm cache
			await this.storage.set(cacheKey, customer, this.config.defaultCacheTtl);

			LogEngine.debug(`Customer found in database: ${discordId}`);
			return customer;

		}
		catch (error) {
			LogEngine.error('Error getting customer by Discord ID:', error);
			return null;
		}
	}

	/**
     * Get customer by Unthread customer ID
     */
	async getCustomerByUnthreadId(unthreadCustomerId: string): Promise<Customer | null> {
		const cacheKey = `customer:unthread:${unthreadCustomerId}`;

		// Try cache first
		const cached = await this.storage.get<Customer>(cacheKey);
		if (cached.found && cached.data) {
			LogEngine.debug(`Customer found in cache (${cached.layer}): ${unthreadCustomerId}`);
			return cached.data;
		}

		// Query database
		try {
			const client = await this.pool.connect();
			const result = await client.query(
				'SELECT * FROM customers WHERE unthread_customer_id = $1',
				[unthreadCustomerId],
			);
			client.release();

			if (result.rows.length === 0) {
				return null;
			}

			const customer = result.rows[0] as Customer;

			// Warm both cache keys
			await Promise.all([
				this.storage.set(cacheKey, customer, this.config.defaultCacheTtl),
				this.storage.set(`customer:discord:${customer.discordId}`, customer, this.config.defaultCacheTtl),
			]);

			LogEngine.debug(`Customer found in database: ${unthreadCustomerId}`);
			return customer;

		}
		catch (error) {
			LogEngine.error('Error getting customer by Unthread ID:', error);
			return null;
		}
	}

	// ==================== THREAD-TICKET MAPPING OPERATIONS ====================

	/**
     * Store thread-ticket mapping
     */
	async storeThreadTicketMapping(mapping: ExtendedThreadTicketMapping): Promise<ExtendedThreadTicketMapping> {
		try {
			const client = await this.pool.connect();

			const result = await client.query(`
                INSERT INTO thread_ticket_mappings 
                (discord_thread_id, unthread_ticket_id, discord_channel_id, customer_id, status)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (discord_thread_id)
                DO UPDATE SET 
                    unthread_ticket_id = $2,
                    discord_channel_id = $3,
                    customer_id = $4,
                    status = $5,
                    updated_at = NOW()
                RETURNING *
            `, [
				mapping.discordThreadId,
				mapping.unthreadTicketId,
				mapping.discordChannelId,
				mapping.customerId,
				mapping.status || 'active',
			]);

			client.release();

			const storedMapping = result.rows[0] as ExtendedThreadTicketMapping;

			// Cache with both thread and ticket as keys
			const threadCacheKey = `mapping:thread:${mapping.discordThreadId}`;
			const ticketCacheKey = `mapping:ticket:${mapping.unthreadTicketId}`;

			await Promise.all([
				this.storage.set(threadCacheKey, storedMapping, this.config.defaultCacheTtl),
				this.storage.set(ticketCacheKey, storedMapping, this.config.defaultCacheTtl),
			]);

			LogEngine.debug(`Thread-ticket mapping stored: ${mapping.discordThreadId} -> ${mapping.unthreadTicketId}`);
			return storedMapping;

		}
		catch (error) {
			LogEngine.error('Error storing thread-ticket mapping:', error);
			throw new Error(`Failed to store mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
     * Get thread-ticket mapping by Discord thread ID
     */
	async getThreadTicketMapping(discordThreadId: string): Promise<ExtendedThreadTicketMapping | null> {
		const cacheKey = `mapping:thread:${discordThreadId}`;

		// Try cache first
		const cached = await this.storage.get<ExtendedThreadTicketMapping>(cacheKey);
		if (cached.found && cached.data) {
			LogEngine.debug(`Mapping found in cache (${cached.layer}): ${discordThreadId}`);
			return cached.data;
		}

		// Query database
		try {
			const client = await this.pool.connect();
			const result = await client.query(
				'SELECT * FROM thread_ticket_mappings WHERE discord_thread_id = $1',
				[discordThreadId],
			);
			client.release();

			if (result.rows.length === 0) {
				return null;
			}

			const mapping = result.rows[0] as ExtendedThreadTicketMapping;

			// Warm cache
			await this.storage.set(cacheKey, mapping, this.config.defaultCacheTtl);

			LogEngine.debug(`Mapping found in database: ${discordThreadId}`);
			return mapping;

		}
		catch (error) {
			LogEngine.error('Error getting thread-ticket mapping:', error);
			return null;
		}
	}

	/**
     * Get thread-ticket mapping by Unthread ticket ID
     */
	async getMappingByTicketId(unthreadTicketId: string): Promise<ExtendedThreadTicketMapping | null> {
		const cacheKey = `mapping:ticket:${unthreadTicketId}`;

		// Try cache first
		const cached = await this.storage.get<ExtendedThreadTicketMapping>(cacheKey);
		if (cached.found && cached.data) {
			LogEngine.debug(`Mapping found in cache (${cached.layer}): ${unthreadTicketId}`);
			return cached.data;
		}

		// Query database
		try {
			const client = await this.pool.connect();
			const result = await client.query(
				'SELECT * FROM thread_ticket_mappings WHERE unthread_ticket_id = $1',
				[unthreadTicketId],
			);
			client.release();

			if (result.rows.length === 0) {
				return null;
			}

			const mapping = result.rows[0] as ExtendedThreadTicketMapping;

			// Warm both cache keys
			await Promise.all([
				this.storage.set(cacheKey, mapping, this.config.defaultCacheTtl),
				this.storage.set(`mapping:thread:${mapping.discordThreadId}`, mapping, this.config.defaultCacheTtl),
			]);

			LogEngine.debug(`Mapping found in database: ${unthreadTicketId}`);
			return mapping;

		}
		catch (error) {
			LogEngine.error('Error getting mapping by ticket ID:', error);
			return null;
		}
	}

	// ==================== BOT CONFIGURATION OPERATIONS ====================

	/**
     * Store bot configuration
     */
	async setBotConfig(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		const cacheKey = `bot:config:${key}`;
		await this.storage.set(cacheKey, value, ttlSeconds || this.config.defaultCacheTtl);
		LogEngine.debug(`Bot config set: ${key}`);
	}

	/**
     * Get bot configuration
     */
	async getBotConfig<T = unknown>(key: string): Promise<T | null> {
		const cacheKey = `bot:config:${key}`;
		const result = await this.storage.get<T>(cacheKey);

		LogEngine.debug(`Bot config get: ${key} (found: ${result.found}, layer: ${result.layer})`);
		return result.data;
	}

	/**
     * Delete bot configuration
     */
	async deleteBotConfig(key: string): Promise<void> {
		const cacheKey = `bot:config:${key}`;
		await this.storage.delete(cacheKey);
		LogEngine.debug(`Bot config deleted: ${key}`);
	}

	// ==================== UTILITY OPERATIONS ====================

	/**
     * Clear cache for a specific entity
     */
	async clearCache(pattern: 'customer' | 'mapping' | 'config', identifier?: string): Promise<void> {
		const patterns = {
			customer: identifier ? [`customer:discord:${identifier}`, `customer:unthread:${identifier}`] : [],
			mapping: identifier ? [`mapping:thread:${identifier}`, `mapping:ticket:${identifier}`] : [],
			config: identifier ? [`bot:config:${identifier}`] : [],
		};

		for (const key of patterns[pattern]) {
			await this.storage.delete(key);
		}

		LogEngine.debug(`Cache cleared for pattern: ${pattern}${identifier ? ` (${identifier})` : ''}`);
	}

	/**
     * Get storage metrics
     */
	getMetrics(): Record<string, number> {
		return this.storage.getMetrics();
	}

	/**
     * Health check for all storage layers
     */
	async healthCheck(): Promise<Record<string, boolean>> {
		const storageHealth = await this.storage.healthCheck();

		// Test database connection
		let dbHealth = false;
		try {
			const client = await this.pool.connect();
			await client.query('SELECT 1');
			client.release();
			dbHealth = true;
		}
		catch (error) {
			LogEngine.error('Database health check failed:', error);
		}

		return {
			...storageHealth,
			database_pool: dbHealth,
		};
	}

	/**
     * Cleanup expired cache entries
     */
	async cleanup(): Promise<void> {
		try {
			const client = await this.pool.connect();
			const result = await client.query('SELECT cleanup_expired_cache()');
			const deletedCount = result.rows[0]?.cleanup_expired_cache || 0;
			client.release();

			LogEngine.info(`Cleanup completed: ${deletedCount} expired cache entries removed`);
		}
		catch (error) {
			LogEngine.error('Cleanup failed:', error);
		}
	}
}