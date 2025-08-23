/**
 * Discord Slash Commands Deployment Script
 *
 * This script registers all slash commands with Discord's API for the specified guild.
 * It scans the commands directory structure, loads all command definitions,
 * and deploys them to Discord for use in the bot.
 *
 * Usage:
 *   node dist/deploy_commands.js
 *   npm run deploycommand
 *
 * Environment Variables Required:
 *   - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 *   - CLIENT_ID: Application ID from Discord Developer Portal
 *   - GUILD_ID: Discord server ID where commands will be deployed
 *
 * @module deploy_commands
 */

import { REST, Routes } from 'discord.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import logger from './utils/logger';

// Load environment variables
dotenv.config();

// Load Discord bot configuration from environment variables
const { DISCORD_BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

/**
 * Validate required environment variables
 */
if (!DISCORD_BOT_TOKEN) {
	logger.error('DISCORD_BOT_TOKEN is required but not set in environment variables');
	process.exit(1);
}

if (!CLIENT_ID) {
	logger.error('CLIENT_ID is required but not set in environment variables');
	process.exit(1);
}

if (!GUILD_ID) {
	logger.error('GUILD_ID is required but not set in environment variables');
	process.exit(1);
}

/**
 * Represents a command module structure
 */
interface CommandModule {
	data: {
		toJSON: () => any;
	};
	execute: (...args: any[]) => Promise<void>;
}

/**
 * Command Collection Array
 *
 * Stores all command definitions in JSON format for deployment to Discord.
 * Commands are automatically discovered from the commands directory structure.
 */
const commands: any[] = [];

/**
 * Command Discovery and Loading
 *
 * Recursively scans the commands directory to find all command files.
 * Each command must export 'data' and 'execute' properties to be valid.
 */
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Scan each command category folder
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file =>
		file.endsWith('.js') || file.endsWith('.ts'),
	);

	// Process each command file in the folder
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);

		try {
			const command = require(filePath) as CommandModule;

			// Validate command structure and add to deployment array
			if ('data' in command && 'execute' in command) {
				commands.push(command.data.toJSON());
				logger.debug(`Loaded command from ${filePath}`);
			}
			else {
				logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
			}
		}
		catch (error) {
			logger.error(`Failed to load command from ${filePath}:`, error);
		}
	}
}

/**
 * Discord REST API Configuration
 *
 * Creates a REST client configured with the bot token for API communication.
 */
const rest = new REST().setToken(DISCORD_BOT_TOKEN);

/**
 * Command Deployment Process
 *
 * Deploys all discovered commands to the specified Discord guild.
 * This replaces any existing commands with the current command set.
 */
(async (): Promise<void> => {
	try {
		logger.info(`Started refreshing ${commands.length} application (/) commands.`);

		if (commands.length === 0) {
			logger.warn('No commands found to deploy.');
			return;
		}

		// Deploy commands to the specified guild
		const data = await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
			{ body: commands },
		) as any[];

		logger.info(`Successfully reloaded ${data.length} application (/) commands.`);
	}
	catch (error) {
		// Log any deployment errors for debugging
		logger.error('Command deployment failed:', error);
		process.exit(1);
	}
})();