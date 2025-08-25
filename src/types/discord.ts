/**
 * Discord Bot Type Definitions
 *
 * Contains type definitions for Discord bot-specific objects and configurations.
 * These extend or supplement the discord.js types for bot-specific use cases.
 *
 * @module types/discord
 */

/**
 * Support ticket modal data from Discord
 */
export interface SupportTicketData {
	title: string;
	issue: string;
	email?: string;
}

/**
 * Thread-to-ticket mapping stored in cache
 */
export interface ThreadTicketMapping {
	discordThreadId: string;
	unthreadTicketId: string;
	createdAt: string;
	lastSyncAt?: string;
}

/**
 * Bot configuration from environment variables
 */
export interface BotConfig {
	DISCORD_BOT_TOKEN: string;
	CLIENT_ID: string;
	GUILD_ID: string;
	UNTHREAD_API_KEY: string;
	UNTHREAD_TRIAGE_CHANNEL_ID: string;
	UNTHREAD_EMAIL_INBOX_ID: string;
	UNTHREAD_WEBHOOK_SECRET: string;
	// Redis URL is now required for data persistence and caching
	REDIS_URL: string;
	FORUM_CHANNEL_IDS?: string;
	DEBUG_MODE?: string;
	PORT?: string;
}

/**
 * Cache key-value operations interface
 */
export interface CacheOperations {
	getKey: (key: string) => Promise<unknown>;
	setKey: (key: string, value: unknown, ttl?: number) => Promise<boolean>;
	deleteKey: (key: string) => Promise<boolean>;
}

/**
 * Customer utility operations interface
 */
export interface CustomerOperations {
	getOrCreateCustomer: (user: unknown, email?: string) => Promise<unknown>;
	getCustomerByDiscordId: (discordId: string) => Promise<unknown>;
	updateCustomer: (customerId: string, updates: Record<string, unknown>) => Promise<unknown>;
}