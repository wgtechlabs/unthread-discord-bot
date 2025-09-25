/**
 * BotsStore - Discord-Specific Storage Operations
 *
 * This module provides high-level storage operations specifically designed for
 * Discord bot functionality, built on top of the UnifiedStorage engine.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This is the primary data access layer for the Discord bot. All customer data,
 * thread mappings, and bot configuration should go through this module to ensure
 * consistency and proper caching across the 3-layer storage system.
 *
 * Features:
 * - Customer management with Discord integration
 * - Thread-ticket mapping persistence
 * - High-performance caching for frequently accessed data
 * - Type-safe operations with full TypeScript support
 * - Automatic cache warming and invalidation
 *
 * 🗝️ STORAGE KEYS PATTERN:
 * =======================
 * - customer:discord:{discordId} - Customer data by Discord ID
 * - customer:unthread:{unthreadId} - Customer data by Unthread ID
 * - mapping:thread:{threadId} - Thread-ticket mapping by Discord thread ID
 * - mapping:ticket:{ticketId} - Thread-ticket mapping by Unthread ticket ID
 * - bot:config:{key} - Bot configuration data
 *
 * 🔧 USAGE PATTERNS:
 * =================
 * - Always use this layer instead of direct UnifiedStorage calls
 * - Customer operations handle Discord ↔ Unthread user mapping
 * - Thread mappings maintain bidirectional ticket relationships
 * - Configuration data is cached across application restarts
 *
 * 🐛 DEBUGGING DATA ISSUES:
 * ========================
 * - Check all 3 storage layers (memory, Redis, PostgreSQL)
 * - Verify key patterns match expected format
 * - Monitor cache hit rates for performance optimization
 * - Review TTL settings for data freshness requirements
 *
 * @module sdk/bots-brain/BotsStore
 */

import { User } from 'discord.js';
import { Pool } from 'pg';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { UnifiedStorage } from './UnifiedStorage';
import { LogEngine } from '../../config/logger';
import { ThreadTicketMapping } from '../../types/discord';
import { getSSLConfig, processConnectionString, isDevelopment } from '../../config/defaults';

// Declare __dirname for CommonJS compatibility
declare const __dirname: string;

/**
 * Safely converts a Date object or ISO string to ISO string
 * Guards against null/undefined values from database
 * Handles both Date objects and string timestamps from node-postgres
 */
function toSafeISOString(date: Date | string | null | undefined): string | undefined {
	if (!date) return undefined;

	// If already a string, validate it's a valid ISO string by constructing a Date
	if (typeof date === 'string') {
		try {
			const parsedDate = new Date(date);
			// Check if the date is valid
			if (isNaN(parsedDate.getTime())) {
				return undefined;
			}
			return parsedDate.toISOString();
		}
		catch {
			return undefined;
		}
	}

	// If it's a Date object, convert directly
	try {
		return date.toISOString();
	}
	catch {
		return undefined;
	}
}

/**
 * Helper function to ensure database connections are always released
 * @param pool - The PostgreSQL connection pool
 * @param operation - The database operation to perform with the client
 * @returns The result of the operation
 */
async function withDbClient<T>(
	pool: Pool,
	operation: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	try {
		return await operation(client);
	}
	finally {
		client.release();
	}
}

/**
 * Customer data structure for Discord users
 */
/**
 * Database row interface for customer table (snake_case from database)
 */
interface CustomerDbRow {
	id?: number;
	discord_id: string;
	unthread_customer_id?: string;
	email?: string;
	username: string;
	display_name?: string;
	avatar_url?: string;
	created_at?: Date | string | null;
	updated_at?: Date | string | null;
	deleted_at?: Date | string | null;
}

/**
 * Database row interface for thread_ticket_mappings table (snake_case from database)
 */
interface MappingDbRow {
	id?: number;
	discord_thread_id: string;
	unthread_ticket_id: string;
	discord_channel_id?: string;
	customer_id?: number;
	status: 'active' | 'closed' | 'archived';
	created_at?: Date | string | null;
	updated_at?: Date | string | null;
	deleted_at?: Date | string | null;
}

export interface Customer {
    id?: number;
    discordId: string;
    unthreadCustomerId?: string;
    email?: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
}

/**
 * Extended thread-ticket mapping with additional metadata
 */
export interface ExtendedThreadTicketMapping extends ThreadTicketMapping {
    id?: number;
    discordChannelId?: string;
    customerId?: number;
    status: 'active' | 'closed' | 'archived';
    deletedAt?: string;
    updatedAt?: string;
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
    postgresUrl: string;
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
			postgresUrl: config.postgresUrl,
			defaultTtlSeconds: config.defaultCacheTtl,
			memoryMaxSize: 1000,
			enableMetrics: config.enableMetrics,
		});

		// Initialize direct database pool for complex queries
		const isProduction = process.env.NODE_ENV === 'production';
		const sslConfig = getSSLConfig(isProduction);
		const processedPostgresUrl = processConnectionString(config.postgresUrl, sslConfig);
		
		// Configure connection pool using the proven pattern from Telegram bot
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const poolConfig: any = {
			connectionString: processedPostgresUrl,
			max: 10,
			idleTimeoutMillis: 30000,
			// Increased to 30s for Railway managed databases (schema operations)
			connectionTimeoutMillis: 30000,
			// Add query timeout for Railway compatibility - 60 seconds for complex schema operations
			query_timeout: 60000,
		};
		
		// Only add SSL config if it's not explicitly disabled
		if (sslConfig !== false) {
			poolConfig.ssl = sslConfig;
		}
		
		this.pool = new Pool(poolConfig);

		LogEngine.info('BotsStore initialized with UnifiedStorage backend');
	}

	/**
	 * Get or create the singleton BotsStore instance
	 *
	 * Implements the singleton pattern to ensure only one BotsStore instance
	 * exists throughout the application lifecycle. This prevents multiple
	 * database connection pools and ensures consistent storage operations.
	 *
	 * @param config - Configuration object required for first initialization only
	 * @returns The singleton BotsStore instance
	 * @throws {Error} When config is missing on first initialization
	 *
	 * @example
	 * ```typescript
	 * // First initialization
	 * const store = BotsStore.getInstance({
	 *   postgresUrl: 'postgresql://...',
	 *   redisCacheUrl: 'redis://...',
	 *   defaultCacheTtl: 3600,
	 *   enableMetrics: true
	 * });
	 *
	 * // Subsequent calls (config not needed)
	 * const sameStore = BotsStore.getInstance();
	 * ```
	 *
	 * @note The instance persists for the application lifetime
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
	 * Validate that all required environment variables are present
	 *
	 * Performs comprehensive validation of environment variables needed
	 * for BotsStore operation. This includes database connection strings,
	 * cache configurations, and other critical settings.
	 *
	 * Required environment variables:
	 * - POSTGRES_URL: PostgreSQL database connection string
	 * - PLATFORM_REDIS_URL: Redis cache connection string for bot state
	 *
	 * @throws {Error} When any required environment variables are missing
	 * @throws Includes detailed error message listing all missing variables
	 *
	 * @example
	 * ```typescript
	 * // Called internally during initialization
	 * // Will throw detailed error if .env is incomplete
	 * BotsStore.validateEnvironmentVariables();
	 * ```
	 *
	 * @see {@link createConfigFromEnvironment} for config creation
	 */
	private static validateEnvironmentVariables(): void {
		const requiredVars = [
			{ name: 'POSTGRES_URL', description: 'PostgreSQL database connection string' },
			{ name: 'PLATFORM_REDIS_URL', description: 'Redis cache connection string for bot state' },
		];

		const missingVars: string[] = [];

		for (const { name, description } of requiredVars) {
			// Safe access since name comes from controlled requiredVars array
			if (!process.env[name as keyof NodeJS.ProcessEnv]) {
				missingVars.push(`${name} (${description})`);
			}
		}

		if (missingVars.length > 0) {
			const errorMessage = [
				'BotsStore initialization failed: Missing required environment variables',
				'',
				'Required variables:',
				...missingVars.map(variable => `  - ${variable}`),
				'',
				'Please set these variables in your .env file or environment.',
			].join('\n');

			throw new Error(errorMessage);
		}
	}

	/**
	 * Create BotsStore configuration from validated environment variables
	 *
	 * Constructs the configuration object using environment variables
	 * that have been validated by validateEnvironmentVariables().
	 * Applies sensible defaults for optional configuration values.
	 *
	 * Configuration defaults:
	 * - defaultCacheTtl: 3600 seconds (1 hour)
	 * - enableMetrics: true in development, false in production
	 *
	 * @returns Complete BotsStore configuration object
	 *
	 * @example
	 * ```typescript
	 * // Internal usage during initialization
	 * const config = BotsStore.createConfigFromEnvironment();
	 * // config contains: postgresUrl, redisCacheUrl, defaultCacheTtl, enableMetrics
	 * ```
	 *
	 * @see {@link validateEnvironmentVariables} for prerequisite validation
	 * @see {@link BotsStoreConfig} for configuration interface
	 */
	private static createConfigFromEnvironment(): BotsStoreConfig {
		return {
			postgresUrl: process.env.POSTGRES_URL!,
			redisCacheUrl: process.env.PLATFORM_REDIS_URL!,
			// 1 hour default cache
			defaultCacheTtl: 3600,
			enableMetrics: isDevelopment,
		};
	}

	/**
	 * Initialize BotsStore singleton from environment configuration
	 *
	 * Convenience method that automatically validates environment variables,
	 * creates configuration, and initializes the BotsStore singleton.
	 * This is the preferred way to initialize BotsStore in production.
	 *
	 * Initialization process:
	 * 1. Validates all required environment variables
	 * 2. Creates configuration from environment
	 * 3. Initializes singleton with configuration
	 * 4. Sets up database and cache connections
	 *
	 * @returns Promise<BotsStore> - The initialized singleton instance
	 * @throws {Error} When environment validation fails
	 * @throws {Error} When database or cache connections fail
	 *
	 * @example
	 * ```typescript
	 * // Preferred initialization method
	 * const store = await BotsStore.initialize();
	 * console.log('BotsStore ready for operations');
	 * ```
	 *
	 * @see {@link validateEnvironmentVariables} for validation logic
	 * @see {@link createConfigFromEnvironment} for config creation
	 * @see {@link getInstance} for singleton management
	 */
	public static async initialize(): Promise<BotsStore> {
		// Validate required environment variables
		this.validateEnvironmentVariables();

		// Create configuration from validated environment
		const config = this.createConfigFromEnvironment();

		// Initialize and return instance
		const store = BotsStore.getInstance(config);
		await store.healthCheck();
		return store;
	}

	// ==================== PRIVATE MAPPER METHODS ====================

	/**
	 * Maps database customer row (snake_case) to Customer interface (camelCase)
	 * Provides type-safe conversion from database format to application format
	 * Includes data integrity checks and soft delete support
	 */
	private mapCustomerRow(dbRow: CustomerDbRow): Customer {
		const customer: Customer = {
			discordId: dbRow.discord_id,
			username: dbRow.username,
		};

		// Add optional fields only if they exist
		if (dbRow.id !== undefined) customer.id = dbRow.id;
		if (dbRow.unthread_customer_id !== undefined) customer.unthreadCustomerId = dbRow.unthread_customer_id;
		if (dbRow.email !== undefined) customer.email = dbRow.email;
		if (dbRow.display_name !== undefined) customer.displayName = dbRow.display_name;
		if (dbRow.avatar_url !== undefined) customer.avatarUrl = dbRow.avatar_url;

		// Data integrity check for created_at with logging
		const createdAt = toSafeISOString(dbRow.created_at);
		if (createdAt === undefined) {
			LogEngine.warn(
				`Missing created_at in customer row for discordId=${dbRow.discord_id}. This may indicate data corruption.`,
			);
		}
		else {
			customer.createdAt = createdAt;
		}

		const updatedAt = toSafeISOString(dbRow.updated_at);
		if (updatedAt !== undefined) customer.updatedAt = updatedAt;

		// Soft delete support
		const deletedAt = toSafeISOString(dbRow.deleted_at);
		if (deletedAt !== undefined) customer.deletedAt = deletedAt;

		return customer;
	}

	/**
	 * Maps database mapping row (snake_case) to ExtendedThreadTicketMapping interface (camelCase)
	 * Provides type-safe conversion from database format to application format
	 * Includes data integrity checks and soft delete support
	 */
	private mapMappingRow(dbRow: MappingDbRow): ExtendedThreadTicketMapping {
		// Data integrity check for created_at with logging and fallback
		const createdAt = toSafeISOString(dbRow.created_at);
		let finalCreatedAt: string;

		if (createdAt === undefined) {
			LogEngine.warn(
				`Missing created_at in mapping row for discordThreadId=${dbRow.discord_thread_id}, unthreadTicketId=${dbRow.unthread_ticket_id}. This may indicate data corruption.`,
			);
			finalCreatedAt = new Date().toISOString();
		}
		else {
			finalCreatedAt = createdAt;
		}

		const mapping: ExtendedThreadTicketMapping = {
			discordThreadId: dbRow.discord_thread_id,
			unthreadTicketId: dbRow.unthread_ticket_id,
			status: dbRow.status,
			createdAt: finalCreatedAt,
		};

		// Add optional fields only if they exist
		if (dbRow.id !== undefined) mapping.id = dbRow.id;
		if (dbRow.discord_channel_id !== undefined) mapping.discordChannelId = dbRow.discord_channel_id;
		if (dbRow.customer_id !== undefined) mapping.customerId = dbRow.customer_id;

		const updatedAt = toSafeISOString(dbRow.updated_at);
		if (updatedAt !== undefined) mapping.updatedAt = updatedAt;

		// Soft delete support
		const deletedAt = toSafeISOString(dbRow.deleted_at);
		if (deletedAt !== undefined) mapping.deletedAt = deletedAt;

		return mapping;
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
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(`
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
			});

			const dbRow = result.rows[0];
			const storedCustomer = this.mapCustomerRow(dbRow);

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
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					'SELECT * FROM customers WHERE discord_id = $1',
					[discordId],
				);
			});

			if (result.rows.length === 0) {
				return null;
			}

			const dbRow = result.rows[0];
			const customer = this.mapCustomerRow(dbRow);

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
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					'SELECT * FROM customers WHERE unthread_customer_id = $1',
					[unthreadCustomerId],
				);
			});

			if (result.rows.length === 0) {
				return null;
			}

			const dbRow = result.rows[0];
			const customer = this.mapCustomerRow(dbRow);

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
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(`
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
			});

			const dbRow = result.rows[0];
			const storedMapping = this.mapMappingRow(dbRow);

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

		// Query database (excluding soft-deleted records)
		try {
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					'SELECT * FROM thread_ticket_mappings WHERE discord_thread_id = $1',
					[discordThreadId],
				);
			});

			if (result.rows.length === 0) {
				return null;
			}

			const dbRow = result.rows[0];
			const mapping = this.mapMappingRow(dbRow);

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
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					'SELECT * FROM thread_ticket_mappings WHERE unthread_ticket_id = $1',
					[unthreadTicketId],
				);
			});

			if (result.rows.length === 0) {
				return null;
			}

			const dbRow = result.rows[0];
			const mapping = this.mapMappingRow(dbRow);

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
		// Validate pattern to prevent object injection
		const validPatterns = ['customer', 'mapping', 'config'];
		if (!validPatterns.includes(pattern)) {
			throw new Error(`Invalid cache pattern: ${pattern}. Must be one of: ${validPatterns.join(', ')}`);
		}

		const patterns = {
			customer: identifier ? [`customer:discord:${identifier}`, `customer:unthread:${identifier}`] : [],
			mapping: identifier ? [`mapping:thread:${identifier}`, `mapping:ticket:${identifier}`] : [],
			config: identifier ? [`bot:config:${identifier}`] : [],
		};

		for (const key of patterns[pattern as keyof typeof patterns]) {
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

		// Test database connection and ensure schema exists
		let dbHealth = false;
		try {
			await withDbClient(this.pool, async (client) => {
				await client.query('SELECT 1');
			});
			
			// Check if we need to run schema setup
			await this.ensureSchema();
			
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
	 * Ensure database schema exists (auto-setup for Railway deployment)
	 * Following the pattern from Telegram bot implementation
	 */
	private async ensureSchema(): Promise<void> {
		try {
			// Wrap schema operations with timeout for Railway compatibility - 2 minutes total timeout
			const schemaTimeout = 120000;
			await Promise.race([
				this.performSchemaCheck(),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Schema operation timed out after 2 minutes')), schemaTimeout),
				),
			]);
		}
		catch (error) {
			const err = error as Error;
			LogEngine.error('Error during schema operations', {
				error: err.message,
				stack: err.stack,
			});
			throw error;
		}
	}

	/**
	 * Perform the actual schema check and initialization
	 * Separated for timeout handling
	 */
	private async performSchemaCheck(): Promise<void> {
		// Check if required tables exist
		const tableCheck = await withDbClient(this.pool, async (client) => {
			return await client.query(`
				SELECT table_name 
				FROM information_schema.tables 
				WHERE table_schema = 'public' 
				AND table_name IN ('customers', 'thread_ticket_mappings', 'storage_cache')
			`);
		});

		const requiredTables = ['customers', 'thread_ticket_mappings', 'storage_cache'];
		const foundTables = tableCheck.rows.map((row: { table_name: string }) => row.table_name);
		const missingTables = requiredTables.filter(table => !foundTables.includes(table));

		if (missingTables.length > 0) {
			LogEngine.info('Database tables missing - setting up automatically...', {
				missing: missingTables,
			});
			await this.initializeSchema();
		}
		else {
			LogEngine.info('Database schema verified', {
				tablesFound: foundTables,
				botsBrainReady: foundTables.includes('storage_cache'),
			});
		}
	}

	/**
	 * Initialize database schema from schema.sql file
	 * Following the proven pattern from Telegram bot implementation
	 *
	 * 🚀 Railway Deployment Compatible:
	 * - Schema file copied during Docker build: dist/database/schema.sql
	 * - Path resolution from dist/sdk/bots-brain/ to dist/database/
	 * - Works with Railway's container file system restrictions
	 * - Individual statement execution for better Railway timeout handling
	 */
	private async initializeSchema(): Promise<void> {
		try {
			LogEngine.info('Starting database schema initialization...');

			// Path from dist/sdk/bots-brain/ to dist/database/schema.sql
			// Matches the Dockerfile copy: dist/database/schema.sql
			const schemaPath = path.join(__dirname, '../../database/schema.sql');
			
			// Check if schema file exists asynchronously
			try {
				await fs.promises.access(schemaPath, fs.constants.F_OK);
			}
			catch {
				throw new Error(`Schema file not found: ${schemaPath}`);
			}

			// Read schema file asynchronously
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- Schema path is safe, built from known dirname
			const schema = await fs.promises.readFile(schemaPath, 'utf8');
			LogEngine.debug('Schema file loaded', {
				path: schemaPath,
				size: schema.length,
			});

			// Execute schema with individual statements for Railway compatibility
			await this.executeSchemaStatements(schema);
			
			LogEngine.info('Database schema created successfully');

		}
		catch (error) {
			const err = error as Error;
			LogEngine.error('Failed to initialize database schema', {
				error: err.message,
				stack: err.stack,
			});
			throw error;
		}
	}

	/**
	 * Execute schema statements individually with timeout handling
	 * Optimized for Railway managed PostgreSQL deployment
	 */
	private async executeSchemaStatements(schema: string): Promise<void> {
		// Split schema into individual statements, handling complex cases
		const statements = this.parseSchemaStatements(schema);
		
		LogEngine.info(`Executing ${statements.length} schema statements individually for Railway compatibility`);

		await withDbClient(this.pool, async (client) => {
			// Set statement timeout for Railway compatibility - 60 seconds
			await client.query('SET statement_timeout = 60000');
			
			let executedCount = 0;
			
			for (const statement of statements) {
				if (statement.trim().length === 0) continue;
				
				try {
					LogEngine.debug(`Executing statement ${executedCount + 1}/${statements.length}`);
					await client.query(statement);
					executedCount++;
				}
				catch (error) {
					LogEngine.error(`Failed to execute schema statement ${executedCount + 1}:`, {
						error: error instanceof Error ? error.message : String(error),
						statement: statement.substring(0, 200) + (statement.length > 200 ? '...' : ''),
					});
					throw error;
				}
			}
			
			LogEngine.info(`Successfully executed ${executedCount} schema statements`);
		});
	}

	/**
	 * Parse schema SQL into individual executable statements
	 * Handles functions, triggers, and multi-line statements properly
	 */
	private parseSchemaStatements(schema: string): string[] {
		// Remove comments and normalize whitespace
		const cleanSchema = schema
			.split('\n')
			.map(line => line.replace(/--.*$/, '').trim())
			.filter(line => line.length > 0)
			.join('\n');

		// Split by semicolons, but handle function definitions
		const statements: string[] = [];
		let currentStatement = '';
		let inFunction = false;
		let dollarQuoteTag = '';

		const lines = cleanSchema.split('\n');
		
		for (const line of lines) {
			const trimmedLine = line.trim();
			
			// Check for function start
			if (trimmedLine.includes('$$') && !inFunction) {
				inFunction = true;
				dollarQuoteTag = '$$';
			}
			
			currentStatement += line + '\n';
			
			// Check for function end
			if (inFunction && trimmedLine.includes(dollarQuoteTag) && trimmedLine !== dollarQuoteTag + ' language \'plpgsql\';') {
				inFunction = false;
				dollarQuoteTag = '';
			}
			
			// Statement complete if we hit semicolon and not in function
			if (trimmedLine.endsWith(';') && !inFunction) {
				if (currentStatement.trim().length > 0) {
					statements.push(currentStatement.trim());
				}
				currentStatement = '';
			}
		}
		
		// Add any remaining statement
		if (currentStatement.trim().length > 0) {
			statements.push(currentStatement.trim());
		}
		
		return statements;
	}

	/**
     * Cleanup expired cache entries
     */
	async cleanup(): Promise<void> {
		try {
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query('SELECT cleanup_expired_cache()');
			});
			const deletedCount = result.rows[0]?.cleanup_expired_cache || 0;

			LogEngine.info(`Cleanup completed: ${deletedCount} expired cache entries removed`);
		}
		catch (error) {
			LogEngine.error('Cleanup failed:', error);
		}
	}

	// ==================== SOFT DELETE OPERATIONS ====================

	/**
	 * Delete a customer permanently
	 * Note: Schema doesn't support soft deletes
	 */
	async softDeleteCustomer(discordId: string): Promise<boolean> {
		try {
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					`DELETE FROM customers 
					 WHERE discord_id = $1
					 RETURNING discord_id`,
					[discordId],
				);
			});

			if (result.rows.length > 0) {
				// Invalidate cache
				const cacheKey = `customer:discord:${discordId}`;
				await this.storage.delete(cacheKey);

				LogEngine.info(`Customer soft deleted: ${discordId}`);
				return true;
			}

			LogEngine.warn(`Customer not found or already deleted: ${discordId}`);
			return false;
		}
		catch (error) {
			LogEngine.error('Failed to soft delete customer:', error);
			throw error;
		}
	}

	/**
	 * Delete a thread-ticket mapping permanently
	 * Note: Schema doesn't support soft deletes
	 */
	async softDeleteMapping(discordThreadId: string): Promise<boolean> {
		try {
			const result = await withDbClient(this.pool, async (client) => {
				return await client.query(
					`DELETE FROM thread_ticket_mappings 
					 WHERE discord_thread_id = $1
					 RETURNING discord_thread_id`,
					[discordThreadId],
				);
			});

			if (result.rows.length > 0) {
				// Invalidate cache
				const threadCacheKey = `mapping:thread:${discordThreadId}`;
				await this.storage.delete(threadCacheKey);

				LogEngine.info(`Mapping soft deleted: ${discordThreadId}`);
				return true;
			}

			LogEngine.warn(`Mapping not found or already deleted: ${discordThreadId}`);
			return false;
		}
		catch (error) {
			LogEngine.error('Failed to soft delete mapping:', error);
			throw error;
		}
	}

	/**
	 * Restore customer functionality disabled - schema doesn't support soft deletes
	 */
	async restoreCustomer(_discordId: string): Promise<boolean> {
		LogEngine.warn('Restore customer not supported - schema uses hard deletes');
		return false;
	}

	/**
	 * Restore mapping functionality disabled - schema doesn't support soft deletes
	 */
	async restoreMapping(_discordThreadId: string): Promise<boolean> {
		LogEngine.warn('Restore mapping not supported - schema uses hard deletes');
		return false;
	}
}