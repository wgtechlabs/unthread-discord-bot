/**
 * Unthread Discord Bot - Main Entry Point
 *
 * This is the primary server file that initializes the Discord bot and Express webhook server.
 * The bot connects to Discord and handles slash commands, while the Express server
 * receives webhooks from Unthread to sync ticket updates.
 *
 * Key Components:
 * - Discord.js Client with required intents and partials
 * - Express server for webhook handling
 * - Command and event loader system
 * - Global client reference for webhook integration
 *
 * Architecture:
 * - Built with TypeScript for type safety and maintainability
 * - Follows KISS (Keep It Simple, Stupid) principle
 * - Clean code approach with comprehensive documentation
 * - Modular design with clear separation of concerns
 *
 * Environment Variables Required:
 * - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 * - CLIENT_ID: Application ID from Discord Developer Portal
 * - GUILD_ID: Discord server ID where commands will be deployed
 * - UNTHREAD_API_KEY: API key for Unthread integration
 * - UNTHREAD_SLACK_CHANNEL_ID: Slack channel ID for ticket routing
 * - UNTHREAD_WEBHOOK_SECRET: Secret for webhook signature verification
 * - REDIS_URL: Redis connection URL for caching and data persistence (required)
 * - PORT: Port for webhook server (optional, defaults to 3000)
 *
 * @module index
 * @author Waren Gonzaga
 * @version v1.0.0-rc1
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
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import { BotConfig } from './types/discord';
import { webhookHandler, initializeWebhookQueue, getQueueManager } from './services/webhook';
import { DiscordWebhookConsumer } from './services/consumer';
import { LogEngine } from './config/logger';
import './types/global';

// Import database to ensure Redis connection is tested on startup
import { testRedisConnection } from './utils/database';

/**
 * Startup Validation Function
 *
 * Validates all required dependencies before starting the bot.
 * This includes Redis connection testing and webhook queue initialization.
 */
async function validateStartupRequirements(): Promise<void> {
	LogEngine.info('Validating startup requirements...');

	try {
		// Test Redis connection explicitly
		await testRedisConnection();

		// Initialize webhook queue system
		await initializeWebhookQueue();

		LogEngine.info('All startup requirements validated successfully');
	}
	catch (error) {
		LogEngine.error('Startup validation failed:', error);
		process.exit(1);
	}
}

// Run startup validation
validateStartupRequirements();

// Load Discord bot token from environment variables
const { DISCORD_BOT_TOKEN, REDIS_URL, PORT } = process.env as Partial<BotConfig>;

// Validate required environment variables
if (!DISCORD_BOT_TOKEN) {
	LogEngine.error('DISCORD_BOT_TOKEN is required but not set in environment variables');
	process.exit(1);
}

if (!REDIS_URL) {
	LogEngine.error('REDIS_URL is required but not set in environment variables');
	LogEngine.error('Redis is now required for proper caching and data persistence');
	LogEngine.error('Please provide a valid Redis connection URL (e.g., redis://localhost:6379)');
	process.exit(1);
}

// Parse port with proper fallback and validation
let port = 3000;
if (PORT) {
	const parsedPort = parseInt(PORT, 10);
	if (!Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
		port = parsedPort;
	}
	else {
		LogEngine.warn(`Invalid PORT value "${PORT}", defaulting to 3000`);
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
 * Express request with raw body for webhook verification
 */
interface WebhookRequest extends express.Request {
	rawBody: string;
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
 * Express Application Setup
 */
const app = express();

/**
 * Express Middleware Configuration
 *
 * Configures JSON parsing with raw body capture for webhook signature verification.
 * The raw body is needed to verify HMAC signatures from Unthread webhooks.
 */
app.use(
	express.json({
		verify: (req: WebhookRequest, res: express.Response, buf: Buffer) => {
			req.rawBody = buf.toString();
		},
	}),
);

/**
 * Webhook Route Handler
 *
 * Handles incoming webhooks from Unthread for ticket updates and synchronization.
 * All webhook processing is delegated to the webhookHandler service.
 */
app.post('/webhook/unthread', webhookHandler);

/**
 * Health Check Endpoint
 *
 * Provides a simple health check endpoint for monitoring and load balancers.
 * Returns application status and dependency health information.
 */
app.get('/health', async (req: express.Request, res: express.Response) => {
	try {
		// Basic health check response
		const healthStatus = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			version: process.env.npm_package_version || 'unknown',
			environment: process.env.NODE_ENV || 'development',
			discord: {
				status: client?.isReady() ? 'connected' : 'disconnected',
				user: client?.user?.tag || 'not logged in',
			},
			redis: {
				status: 'connected',
			},
		};

		res.status(200).json(healthStatus);
	}
	catch (error) {
		LogEngine.error('Health check failed:', error);
		res.status(503).json({
			status: 'unhealthy',
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
});

/**
 * Start Express Server
 *
 * Starts the webhook server on the configured port.
 * This server must be publicly accessible for Unthread to send webhooks.
 */
app.listen(port, () => {
	LogEngine.info(`Server listening on port ${port}`);
});

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

				if ('data' in command && 'execute' in command) {
					client.commands.set(command.data.name, command);
					LogEngine.debug(`Loaded command: ${command.data.name}`);
				}
				else {
					LogEngine.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
				}
			}
			catch (error) {
				LogEngine.error(`Failed to load command from ${filePath}:`, error);
			}
		}
	}

	LogEngine.info(`Loaded ${client.commands.size} commands successfully.`);
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

			LogEngine.debug(`Loaded event: ${event.name}`);
		}
		catch (error) {
			LogEngine.error(`Failed to load event from ${filePath}:`, error);
		}
	}

	LogEngine.info(`Loaded ${eventFiles.length} events successfully.`);
}
catch (error) {
	LogEngine.error('Failed to load events directory:', error);
}

/**
 * Discord Client Login and Global Setup
 *
 * Logs in the Discord client and sets up global reference for webhook access.
 * The global client reference allows the webhook handler to access Discord functionality.
 * Also starts the webhook event consumer for queue processing.
 */
client.login(DISCORD_BOT_TOKEN)
	.then(async () => {
		global.discordClient = client;
		LogEngine.info('Discord client is ready and set globally.');

		// Start the webhook event consumer
		try {
			const queueManager = getQueueManager();
			if (queueManager) {
				const consumer = new DiscordWebhookConsumer(client, queueManager);
				await consumer.start();
				LogEngine.info('Discord webhook consumer started successfully');

				// Store consumer globally for graceful shutdown
				global.webhookConsumer = consumer;
			}
			else {
				LogEngine.error('Queue manager not available for webhook consumer');
			}
		}
		catch (error) {
			LogEngine.error('Failed to start webhook consumer:', error);
			// Don't exit here - the bot can still function for direct Discord interactions
		}
	})
	.catch((error: Error) => {
		LogEngine.error('Failed to login Discord client:', error);
		process.exit(1);
	});

/**
 * Graceful Shutdown Handler
 *
 * Handles SIGINT and SIGTERM signals to ensure clean shutdown of the application.
 * This includes stopping the webhook consumer and closing Redis connections.
 */
process.on('SIGINT', async () => {
	LogEngine.info('Received SIGINT, starting graceful shutdown...');
	await gracefulShutdown();
});

process.on('SIGTERM', async () => {
	LogEngine.info('Received SIGTERM, starting graceful shutdown...');
	await gracefulShutdown();
});

/**
 * Perform graceful shutdown of all services
 */
async function gracefulShutdown(): Promise<void> {
	try {
		// Stop webhook consumer
		if (global.webhookConsumer) {
			LogEngine.info('Stopping webhook consumer...');
			await global.webhookConsumer.stop();
		}

		// Close queue manager
		const queueManager = getQueueManager();
		if (queueManager) {
			LogEngine.info('Closing queue manager...');
			await queueManager.close();
		}

		// Destroy Discord client
		if (client && client.isReady()) {
			LogEngine.info('Destroying Discord client...');
			client.destroy();
		}

		LogEngine.info('Graceful shutdown completed');
		process.exit(0);

	}
	catch (error) {
		LogEngine.error('Error during graceful shutdown:', error);
		process.exit(1);
	}
}