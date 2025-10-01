/**
 * Command Deploy Tool
 *
 * Force deployment utility for Discord slash commands.
 * This tool always deploys all commands regardless of current state,
 * ensuring complete synchronization between local definitions and Discord.
 *
 * Features:
 * - Force deployment (no smart checking)
 * - Complete command registration guarantee
 * - Detailed logging with LogEngine
 * - Environment validation
 * - Error handling with proper exit codes
 *
 * Usage:
 *   yarn cmd:deploy
 *   node dist/command_deploy.js
 *
 * Environment Variables Required:
 *   - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 *   - CLIENT_ID: Application ID from Discord Developer Portal
 *   - GUILD_ID: Discord server ID where commands will be deployed
 *
 * @module command_deploy
 */

import { REST, Routes } from 'discord.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { LogEngine } from './config/logger';

// Load environment variables
dotenv.config();

// Load Discord bot configuration from environment variables
const { DISCORD_BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
	if (!DISCORD_BOT_TOKEN) {
		LogEngine.error('DISCORD_BOT_TOKEN is required but not set in environment variables');
		process.exit(1);
	}

	if (!CLIENT_ID) {
		LogEngine.error('CLIENT_ID is required but not set in environment variables');
		process.exit(1);
	}

	if (!GUILD_ID) {
		LogEngine.error('GUILD_ID is required but not set in environment variables');
		process.exit(1);
	}
}

/**
 * Represents a command module structure
 */
interface CommandModule {
	data: {
		name: string;
		toJSON: () => Record<string, unknown>;
	};
	execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Load all commands from the commands directory
 *
 * @returns Array of command JSON objects ready for Discord API
 */
function loadCommands(): Record<string, unknown>[] {
	const commands: Record<string, unknown>[] = [];
	const foldersPath = path.join(__dirname, 'commands');

	LogEngine.info('Loading commands from directory structure...');

	// Safely read the commands directory
	let commandFolders: string[];
	try {
		commandFolders = fs.readdirSync(foldersPath);
	}
	catch (error) {
		LogEngine.error('Failed to read commands directory:', error);
		process.exit(1);
	}

	for (const folder of commandFolders) {
		// Scan each command category folder
		const commandsPath = path.join(foldersPath, folder);
		let commandFiles: string[];

		try {
			// Determine file extension based on environment
			const usingTsNode = __filename.endsWith('.ts');

			// eslint-disable-next-line security/detect-non-literal-fs-filename
			commandFiles = fs.readdirSync(commandsPath).filter(file =>
				usingTsNode ? file.endsWith('.ts') : file.endsWith('.js'),
			);
		}
		catch (error) {
			LogEngine.warn(`Failed to read folder ${folder}:`, error);
			continue;
		}

		// Process each command file in the folder
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
					typeof command.data.toJSON === 'function' &&
					typeof command.execute === 'function') {

					commands.push(command.data.toJSON());
					LogEngine.debug(`Loaded command: ${command.data.name} from ${file}`);
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
						else if (typeof command.data.toJSON !== 'function') {
							issues.push('command.data.toJSON is missing or not a function');
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

	LogEngine.info(`Successfully loaded ${commands.length} commands`);
	return commands;
}

/**
 * Deploy commands to Discord API
 *
 * @param commands Array of command objects to deploy
 */
async function deployCommands(commands: Record<string, unknown>[]): Promise<void> {
	if (commands.length === 0) {
		LogEngine.warn('No commands found to deploy');
		return;
	}

	// Initialize Discord REST client
	const rest = new REST().setToken(DISCORD_BOT_TOKEN!);

	LogEngine.info(`Deploying ${commands.length} commands to Discord (force deployment)...`);

	try {
		// Deploy commands to the specified guild (force deployment)
		const data = await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID!),
			{ body: commands },
		) as Record<string, unknown>[];

		LogEngine.info(`Successfully deployed ${data.length} slash commands to Discord API`);
		LogEngine.info('All commands have been registered and are now available in Discord');
	}
	catch (error) {
		LogEngine.error('Command deployment failed:', error);
		process.exit(1);
	}
}

/**
 * Main deployment process
 */
async function main(): Promise<void> {
	LogEngine.info('Starting command deployment process...');

	// Validate environment
	validateEnvironment();

	// Load commands
	const commands = loadCommands();

	// Deploy commands
	await deployCommands(commands);

	LogEngine.info('Command deployment completed successfully');
}

// Execute main function
main().catch((error) => {
	LogEngine.error('Unexpected error during deployment:', error);
	process.exit(1);
});
