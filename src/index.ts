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
 * - DATABASE_URL: PostgreSQL connection URL for L3 persistent storage (required)
 * - PLATFORM_REDIS_URL: Redis connection URL for L2 cache layer (required)
 * - WEBHOOK_REDIS_URL: Redis connection URL for webhook queue processing (required)
 * - FORUM_CHANNEL_IDS: Comma-separated list of forum channel IDs for automatic ticket creation (optional)
 * - DEBUG_MODE: Enable verbose logging during development (optional, defaults to false)
 * - PORT: Port for webhook server (optional, defaults to 3000)
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
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import { BotConfig } from './types/discord';
import { webhookHandler, webhookHealthCheck, webhookMetrics, retryFailedWebhooks, initializeWebhookService } from './services/webhook';
import { validateEnvironment } from './services/unthread';
import { LogEngine } from './config/logger';
import { version } from '../package.json';
import './types/global';

// Import new storage architecture
import { BotsStore } from './sdk/bots-brain/BotsStore';

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

		if (!health.memory || !health.redis || !health.postgres) {
			throw new Error('Storage layer health check failed');
		}

		LogEngine.info('3-layer storage architecture validated successfully');

		// Initialize webhook service with queue processing
		await initializeWebhookService();
		LogEngine.info('Queue-based webhook processing initialized');

		LogEngine.info('All startup requirements validated successfully');
	}
	catch (error) {
		LogEngine.error('Startup validation failed:', error);
		process.exit(1);
	}
}

/**
 * Storage Health Check
 *
 * Safely probes all storage layers without throwing errors.
 * Returns status and error information for health monitoring.
 */
async function checkStorageHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; layers: Record<string, boolean>; error?: string }> {
	try {
		const botsStore = BotsStore.getInstance();
		const health = await botsStore.healthCheck();

		const healthyLayers = Object.values(health).filter(h => h).length;
		const totalLayers = Object.keys(health).length;

		let status: 'healthy' | 'degraded' | 'unhealthy';
		if (healthyLayers === totalLayers) {
			status = 'healthy';
		}
		else if (healthyLayers > 0) {
			status = 'degraded';
		}
		else {
			status = 'unhealthy';
		}

		return { status, layers: health };
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown storage error';
		return {
			status: 'unhealthy',
			layers: { memory: false, redis: false, postgres: false },
			error: errorMessage,
		};
	}
}

/**
 * Main startup function
 *
 * Initializes the Discord bot and Express webhook server with comprehensive
 * environment validation and error handling.
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
			'UNTHREAD_WEBHOOK_SECRET',
			'DATABASE_URL',
			'PLATFORM_REDIS_URL',
			'WEBHOOK_REDIS_URL',
		];
		const { DISCORD_BOT_TOKEN, DATABASE_URL, PLATFORM_REDIS_URL } = process.env as Partial<BotConfig>;

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

		if (!DATABASE_URL) {
			LogEngine.error('DATABASE_URL is required for PostgreSQL connection');
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

		// Step 5: Start Express server after all validation and setup completes
		app.listen(port, () => {
			LogEngine.info(`🚀 Unthread Discord Bot server listening on port ${port}`);
			LogEngine.info(`📊 Health check available at: http://localhost:${port}/health`);
			LogEngine.info(`🔗 Webhook endpoint at: http://localhost:${port}/webhook/unthread`);
			LogEngine.info(`📈 Webhook metrics at: http://localhost:${port}/webhook/metrics`);
		});
	}
	catch (error) {
		LogEngine.error('Failed to start bot:', error);
		process.exit(1);
	}
}


// Parse port with proper fallback and validation
const { PORT } = process.env as Partial<BotConfig>;
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
 * Raw Body JSON Middleware for Webhook Signature Verification
 *
 * This middleware is specifically designed for webhook routes that require
 * raw body access for HMAC signature verification. It captures the raw body
 * while still parsing JSON for convenient access. Includes a 1MB body size
 * limit for security protection against DoS attacks.
 */
const rawBodyJsonMiddleware = express.json({
	limit: '1mb',
	verify: (req: express.Request, _res: express.Response, buf: Buffer, encoding: string) => {
		const webhookReq = req as WebhookRequest;
		webhookReq.rawBody = buf.toString(encoding as BufferEncoding);
	},
});

/**
 * Webhook Route Handler
 *
 * Handles incoming webhooks from Unthread for ticket updates and synchronization.
 * Uses dedicated JSON middleware with raw body capture for signature verification.
 * All webhook processing is delegated to the queue-based webhookHandler service.
 */
app.post('/webhook/unthread', rawBodyJsonMiddleware, webhookHandler);

/**
 * Webhook Management Endpoints
 */
app.get('/webhook/health', webhookHealthCheck);
app.get('/webhook/metrics', webhookMetrics);
app.post('/webhook/retry', retryFailedWebhooks);

/**
 * Health Check Endpoint
 *
 * Provides a comprehensive health check endpoint for monitoring and load balancers.
 * Returns application status and all storage layer health information.
 */
app.get('/health', async (_req: express.Request, res: express.Response) => {
	try {
		// Perform comprehensive storage health check
		const storageHealth = await checkStorageHealth();

		// Check Discord client status
		const discordStatus = client.isReady() ? 'connected' : 'disconnected';

		// Overall status logic
		let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
		if (storageHealth.status === 'healthy' && discordStatus === 'connected') {
			overallStatus = 'healthy';
		}
		else if (storageHealth.status === 'unhealthy' || discordStatus === 'disconnected') {
			overallStatus = 'unhealthy';
		}
		else {
			overallStatus = 'degraded';
		}

		const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

		res.status(statusCode).json({
			status: overallStatus,
			timestamp: new Date().toISOString(),
			version,
			services: {
				discord: discordStatus,
				storage: storageHealth.status,
				storage_layers: storageHealth.layers,
			},
			error: storageHealth.error,
		});
	}
	catch (error) {
		LogEngine.error('Health check endpoint error:', error);
		res.status(503).json({
			status: 'unhealthy',
			timestamp: new Date().toISOString(),
			version,
			error: 'Health check failed',
		});
	}
});

/**
 * Basic Application Info Endpoint
 */
app.get('/', (_req: express.Request, res: express.Response) => {
	res.json({
		name: 'Unthread Discord Bot',
		version,
		description: 'Official Discord bot integration for Unthread.io ticketing system',
		architecture: '3-layer storage with queue-based processing',
		endpoints: {
			webhook: '/webhook/unthread',
			health: '/health',
			webhook_health: '/webhook/health',
			webhook_metrics: '/webhook/metrics',
			webhook_retry: '/webhook/retry',
		},
	});
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