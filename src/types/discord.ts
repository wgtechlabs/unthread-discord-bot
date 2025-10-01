/**
 * Discord Bot Type Definitions
 *
 * Contains type definitions for Discord bot-specific objects and configurations.
 * These extend or supplement the discord.js types for bot-specific use cases.
 *
 * @module types/discord
 */

/**
 * Support ticket data collected from Discord modal forms
 */
export interface SupportTicketData {
	/** Ticket title/subject */
	title: string;
	/** Detailed description of the issue */
	issue: string;
	/** User's email address (optional) */
	email?: string;
}

/**
 * Bidirectional mapping between Discord threads and Unthread tickets
 *
 * Stored in cache to enable message forwarding and webhook routing.
 */
export interface ThreadTicketMapping {
	/** Discord thread ID */
	discordThreadId: string;
	/** Unthread ticket/conversation ID */
	unthreadTicketId: string;
	/** ISO timestamp when mapping was created */
	createdAt: string;
	/** ISO timestamp of last synchronization (optional) */
	lastSyncAt?: string;
}

/**
 * Bot configuration loaded from environment variables
 *
 * All required environment variables for the Discord bot to function properly.
 */
export interface BotConfig {
	/** Discord bot token from Developer Portal */
	DISCORD_BOT_TOKEN: string;
	/** Discord application/client ID */
	CLIENT_ID: string;
	/** Discord server/guild ID where bot operates */
	GUILD_ID: string;
	/** Unthread API key for service integration */
	UNTHREAD_API_KEY: string;
	/** Slack channel ID for ticket routing in Unthread */
	UNTHREAD_SLACK_CHANNEL_ID: string;
	/** Redis connection URL for caching and data persistence (legacy support) */
	REDIS_URL?: string;
	/** PostgreSQL database URL for L3 storage (required) */
	POSTGRES_URL: string;
	/** Redis cache URL for L2 storage (required) */
	PLATFORM_REDIS_URL: string;
	/** Redis queue URL for webhook processing (required) */
	WEBHOOK_REDIS_URL: string;
	/** Comma-separated list of forum channel IDs for auto-ticket creation (optional) */
	FORUM_CHANNEL_IDS?: string;
	/** Port for Discord bot health endpoint (optional, defaults to 3001) */
	PORT?: string;
}

/**
 * Cache operations interface for key-value storage
 *
 * Abstraction over Redis or other caching systems.
 */
export interface CacheOperations {
	/** Retrieve a value by key */
	getKey: (key: string) => Promise<unknown>;
	/** Store a value with optional TTL in seconds */
	setKey: (key: string, value: unknown, ttl?: number) => Promise<void>;
	/** Store a value with long-term persistence (3 years TTL) */
	setPersistentKey: (key: string, value: unknown) => Promise<void>;
	/** Remove a key from cache */
	deleteKey: (key: string) => Promise<void>;
}

/**
 * Customer utility operations interface
 *
 * Interface for customer management functions.
 */
export interface CustomerOperations {
	/** Create or retrieve existing customer */
	getOrCreateCustomer: (user: unknown, email?: string) => Promise<unknown>;
	/** Find customer by Discord user ID */
	getCustomerByDiscordId: (discordId: string) => Promise<unknown>;
	/** Update existing customer record */
	updateCustomer: (customer: unknown) => Promise<unknown>;
}