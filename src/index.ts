/**
 * Unthread Discord Bot - Main Entry Point
 *
 * This is the primary server file that initializes the Discord bot as a Redis consumer.
 * The bot connects to Discord and handles slash commands, while consuming events
 * from Redis queue populated by the unthread-webhook-server.
 *
 * 🏗️ ARCHITECTURE OVERVIEW FOR CONTRIBUTORS:
 * ==========================================
 * This bot follows a modular, Redis-based architecture:
 *
 * 1. Discord Client: Handles real-time Discord events (messages, interactions)
 * 2. Redis Consumer: Consumes webhook events from Redis queue
 * 3. 3-Layer Storage: PostgreSQL (L3) + Redis (L2) + Memory (L1) via BotsStore
 *
 * Data Flow:
 * Discord → Bot → Unthread API → Webhook Server → Redis Queue → Discord Bot
 *
 * Key Components:
 * - Discord.js Client with required intents and partials
 * - Command and event loader system
 * - Global client reference for integration
 * - Redis-based event consumption
 * - BotsStore SDK for unified data persistence
 *
 * 🔧 DEVELOPMENT SETUP:
 * =====================
 * 1. Copy .env.example to .env and fill required variables
 * 2. Run `yarn install` to install dependencies
 * 3. Run `yarn dev` for development with auto-reload
 * 4. Use `yarn deploycommand` to register slash commands
 * 5. Check logs for connection status and errors
 *
 * 🐛 TROUBLESHOOTING:
 * ==================
 * - Bot not responding? Check DISCORD_BOT_TOKEN and permissions
 * - Webhook issues? Verify Redis connections and queue processing
 * - Commands not working? Redeploy with `yarn deploycommand`
 * - Database errors? Check PostgreSQL connection and migrations
 *
 * Environment Variables Required:
 * - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 * - CLIENT_ID: Application ID from Discord Developer Portal
 * - GUILD_ID: Discord server ID where commands will be deployed
 * - UNTHREAD_API_KEY: API key for Unthread integration
 * - UNTHREAD_SLACK_CHANNEL_ID: Slack channel ID for ticket routing
 * - POSTGRES_URL: PostgreSQL connection URL for L3 persistent storage (required)
 * - PLATFORM_REDIS_URL: Redis connection URL for L2 cache layer (required)
 * - WEBHOOK_REDIS_URL: Redis connection URL for webhook queue processing (required)
 * - FORUM_CHANNEL_IDS: Comma-separated list of forum channel IDs for automatic ticket creation (optional)
 * - NODE_ENV: Environment mode (development enables debug logging, production uses info level)
 *
 * NOTE: The bot now operates as a pure Redis consumer, processing events from
 * the unthread-webhook-server via Redis queue, eliminating the need for direct
 * webhook endpoints.
 *
 * @module index
 * @author Waren Gonzaga
 * @since 0.1.0
 *
 * @example
 * // Start the bot in development mode
 * yarn dev
 *
 * @example
 * // Build and start in production
 * yarn build && yarn start
 *
 * @see {@link https://discord.js.org/} Discord.js Documentation
 * @see {@link https://unthread.com/} Unthread Platform
 */

// Load environment variables first, before any other imports
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'node:path';
import { Client, Collection, GatewayIntentBits, Partials, Events } from 'discord.js';
import { BotConfig } from './types/discord';
import { validateEnvironment } from './services/unthread';
import { LogEngine } from './config/logger';
import './types/global';

// Import new storage architecture
import { BotsStore } from './sdk/bots-brain/BotsStore';

// Import clean webhook consumer
import { WebhookConsumer } from './sdk/webhook-consumer';

/**
 * Startup Validation Function
 *
 * Validates all required dependencies before starting the bot.
 * This includes storage layers testing and other critical validations.
 *
 * @throws {Error} When storage connection fails or other startup requirements are not met
 */
async function validateStartupRequirements(): Promise<void> {
	LogEngine.info('Validating startup requirements...');

	try {
		// Initialize and test the new storage architecture
		const botsStore = await BotsStore.initialize();
		const health = await botsStore.healthCheck();

		// Log detailed health status for debugging
		LogEngine.info('Storage health check results:', health);

		// Check storage health with specific error details
		const failedLayers = [];
		if (!health.memory) failedLayers.push('memory');
		if (!health.redis) failedLayers.push('redis');
		if (!health.postgres) failedLayers.push('postgres');
		if (!health.database_pool) failedLayers.push('database_pool');

		if (failedLayers.length > 0) {
			throw new Error(`Storage layer health check failed: ${failedLayers.join(', ')} layer(s) unhealthy`);
		}

		LogEngine.info('3-layer storage architecture validated successfully');
		LogEngine.info('All startup requirements validated successfully');
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		LogEngine.error('Startup validation failed:', errorMessage);
		if (errorStack) {
			LogEngine.debug('Error stack:', errorStack);
		}
		process.exit(1);
	}
}

/**
 * Main startup function
 *
 * Initializes the Discord bot with comprehensive environment validation
 * and error handling. Now operates as a pure Redis consumer.
 *
 * @throws {Error} When required environment variables are missing or invalid
 * @throws {Error} When Discord client login fails
 * @throws {Error} When Redis connection cannot be established
 */
async function main(): Promise<void> {
	try {
		// Step 1: Load and validate environment variables
		const requiredEnvVars = [
			'DISCORD_BOT_TOKEN',
			'CLIENT_ID',
			'GUILD_ID',
			'UNTHREAD_API_KEY',
			'UNTHREAD_SLACK_CHANNEL_ID',
			'POSTGRES_URL',
			'PLATFORM_REDIS_URL',
			'WEBHOOK_REDIS_URL',
		];
		const { DISCORD_BOT_TOKEN, POSTGRES_URL, PLATFORM_REDIS_URL } = process.env as Partial<BotConfig>;

		const missingVars: string[] = [];

		for (const envVar of requiredEnvVars) {
			// eslint-disable-next-line security/detect-object-injection
			const envValue = process.env[envVar];
			if (!envValue) {
				missingVars.push(envVar);
			}
		}

		if (missingVars.length > 0) {
			LogEngine.error(`Missing required environment variables: ${missingVars.join(', ')}`);
			LogEngine.error('Please ensure all required environment variables are set before starting the bot');
			process.exit(1);
		}

		// Step 2: Validate Unthread-specific environment variables
		validateEnvironment();

		// Additional specific validation for critical variables
		if (!DISCORD_BOT_TOKEN) {
			LogEngine.error('DISCORD_BOT_TOKEN is required but not set in environment variables');
			process.exit(1);
		}

		if (!POSTGRES_URL) {
			LogEngine.error('POSTGRES_URL is required for PostgreSQL connection');
			LogEngine.error('Please provide a valid PostgreSQL connection URL (e.g., postgres://user:password@localhost:5432/database)');
			process.exit(1);
		}

		if (!PLATFORM_REDIS_URL) {
			LogEngine.error('PLATFORM_REDIS_URL is required for L2 cache layer');
			LogEngine.error('Please provide a valid Redis connection URL (e.g., redis://localhost:6379)');
			process.exit(1);
		}

		// Step 3: Initialize and validate the new 3-layer storage architecture
		await validateStartupRequirements();

		// Step 4: Start Discord login after validation succeeds
		await client.login(DISCORD_BOT_TOKEN);
		global.discordClient = client;
		LogEngine.info('Discord client is ready and set globally.');

		LogEngine.info('🚀 Unthread Discord Bot started successfully as Redis consumer');
	}
	catch (error) {
		LogEngine.error('Failed to start bot:', error);
		process.exit(1);
	}
}


/**
 * Extended Discord client with commands collection
 */
interface ExtendedClient extends Client {
	commands: Collection<string, CommandModule>;
}

/**
 * Command module structure
 */
interface CommandModule {
	data: {
		name: string;
		toJSON: () => Record<string, unknown>;
	};
	execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Event module structure
 */
interface EventModule {
	name: string;
	once?: boolean;
	execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Discord Client Configuration
 *
 * Configures the Discord client with necessary intents and partials:
 * - Guilds: Basic guild functionality
 * - MessageContent: Access to message content (required for content reading)
 * - GuildMessages: Message events in guilds
 * - GuildMessageReactions: Reaction events
 *
 * Partials allow the bot to receive events for objects that may not be fully cached:
 * - Channel, Message, Reaction: For incomplete message data
 * - ThreadMember, Thread: For thread-related events
 */
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
	],
	partials: [
		Partials.Channel,
		Partials.Message,
		Partials.Reaction,
		Partials.ThreadMember,
	],
}) as ExtendedClient;

/**
 * Command Loading System
 *
 * Dynamically loads all slash commands from the commands directory structure.
 * Commands are organized in folders and must export 'data' and 'execute' properties.
 * Successfully loaded commands are registered in the client.commands Collection.
 * Handles both development (.ts) and production (.js) environments.
 */
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');

try {
	const commandFolders = fs.readdirSync(foldersPath);

	for (const folder of commandFolders) {
		const commandsPath = path.join(foldersPath, folder);

		// Determine file extension based on environment
		const usingTsNode = __filename.endsWith('.ts');

		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const commandFiles = fs.readdirSync(commandsPath).filter(file =>
			usingTsNode ? file.endsWith('.ts') : file.endsWith('.js'),
		);

		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);

			try {
				// Dynamic require is necessary for loading command modules
				// eslint-disable-next-line security/detect-non-literal-require
				const mod = require(filePath) as CommandModule | { default: CommandModule };

				// Handle both CommonJS and ESM exports
				const command = ('default' in mod ? mod.default : mod) as CommandModule;

				// Robust validation with explicit type checks
				if (command &&
					typeof command === 'object' &&
					command.data &&
					typeof command.data === 'object' &&
					typeof command.data.name === 'string' &&
					command.data.name.trim() !== '' &&
					typeof command.execute === 'function') {

					client.commands.set(command.data.name, command);
					// Individual command loading moved to summary for cleaner logs
				}
				else {
					// Enhanced error reporting with specific validation failures
					const issues: string[] = [];
					if (!command || typeof command !== 'object') {
						issues.push('command is not an object');
					}
					else {
						if (!command.data || typeof command.data !== 'object') {
							issues.push('command.data is missing or not an object');
						}
						else if (typeof command.data.name !== 'string' || command.data.name.trim() === '') {
							issues.push('command.data.name is missing or not a non-empty string');
						}
						if (typeof command.execute !== 'function') {
							issues.push('command.execute is missing or not a function');
						}
					}
					LogEngine.warn(`Skipping invalid command at ${filePath}: ${issues.join(', ')}`);
				}
			}
			catch (error) {
				LogEngine.error(`Failed to load command from ${filePath}:`, error);
			}
		}
	}

	const commandNames = Array.from(client.commands.keys()).join(', ');
	LogEngine.info(`Loaded ${client.commands.size} commands successfully: ${commandNames}`);
}
catch (error) {
	LogEngine.error('Failed to load commands directory:', error);
}

/**
 * Event Loading System
 *
 * Dynamically loads all event handlers from the events directory.
 * Events can be configured to run once or on every occurrence.
 * Each event file must export name, execute, and optionally 'once' properties.
 * Validates event module structure before registration.
 */
const eventsPath = path.join(__dirname, 'events');

try {
	// Determine file extension based on environment
	const usingTsNode = __filename.endsWith('.ts');

	const eventFiles = fs
		.readdirSync(eventsPath)
		.filter((file) => usingTsNode ? file.endsWith('.ts') : file.endsWith('.js'));

	const loadedEventNames: string[] = [];

	for (const file of eventFiles) {
		const filePath = path.join(eventsPath, file);

		try {
			// Dynamic require is necessary for loading event modules
			// eslint-disable-next-line security/detect-non-literal-require
			const mod = require(filePath) as EventModule | { default: EventModule };

			// Handle both CommonJS and ESM exports
			const event = ('default' in mod ? mod.default : mod) as Partial<EventModule>;

			// Validate required properties before registering events
			if (!event?.name || typeof event.execute !== 'function') {
				LogEngine.warn(`The event at ${filePath} is missing required "name" or "execute" properties.`);
				continue;
			}

			if (event.once) {
				client.once(event.name, (...args: unknown[]) => event.execute!(...args));
			}
			else {
				client.on(event.name, (...args: unknown[]) => event.execute!(...args));
			}

			loadedEventNames.push(event.name);
		}
		catch (error) {
			LogEngine.error(`Failed to load event from ${filePath}:`, error);
		}
	}

	LogEngine.info(`Loaded ${loadedEventNames.length} events successfully: ${loadedEventNames.join(', ')}`);
}
catch (error) {
	LogEngine.error('Failed to load events directory:', error);
}

// Kick off startup after all modules are wired
main();

/**
 * Initialize WebhookConsumer for Redis-based event processing
 *
 * This replaces the complex BullMQ implementation with a simple Redis consumer
 * that polls the queue and processes events directly.
 */
let webhookConsumer: WebhookConsumer | null = null;

/**
 * Initialize WebhookConsumer after Discord client is ready
 *
 * Uses proper event-driven startup coordination instead of arbitrary timeouts.
 * Waits for the ClientReady event to ensure Discord client is fully initialized.
 */
async function initializeWebhookConsumer(): Promise<void> {
	try {
		// Check if webhook Redis URL is configured
		if (process.env.WEBHOOK_REDIS_URL) {
			LogEngine.info('Initializing clean Redis-based webhook consumer...');

			webhookConsumer = new WebhookConsumer({
				redisUrl: process.env.WEBHOOK_REDIS_URL,
				queueName: 'unthread-events',
				// Poll every second
				pollInterval: 1000,
			});

			await webhookConsumer.start();
			LogEngine.info('✅ Webhook consumer started successfully - polling Redis queue for events');
		}
		else {
			LogEngine.warn('WEBHOOK_REDIS_URL not configured - webhook consumer disabled');
		}
	}
	catch (error) {
		LogEngine.error('Failed to initialize webhook consumer:', error);
		LogEngine.warn('Bot will continue without Redis-based webhook processing');
	}
}

// Initialize WebhookConsumer after Discord client is ready
client.once(Events.ClientReady, async () => {
	// Add small delay to ensure ready event handler completes
	await new Promise(resolve => setTimeout(resolve, 100));
	await initializeWebhookConsumer();
});

/**
 * Graceful shutdown handler for WebhookConsumer
 */
process.on('SIGINT', async () => {
	LogEngine.info('Received SIGINT - shutting down webhook consumer...');
	if (webhookConsumer) {
		await webhookConsumer.stop();
		LogEngine.info('Webhook consumer stopped');
	}
});

process.on('SIGTERM', async () => {
	LogEngine.info('Received SIGTERM - shutting down webhook consumer...');
	if (webhookConsumer) {
		await webhookConsumer.stop();
		LogEngine.info('Webhook consumer stopped');
	}
});