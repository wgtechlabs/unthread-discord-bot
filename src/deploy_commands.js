/**
 * Discord Slash Commands Deployment Script
 * 
 * This script registers all slash commands with Discord's API for the specified guild.
 * It scans the commands directory structure, loads all command definitions,
 * and deploys them to Discord for use in the bot.
 * 
 * Usage:
 *   node src/deploy_commands.js
 *   npm run deploycommand
 * 
 * Environment Variables Required:
 *   - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 *   - CLIENT_ID: Application ID from Discord Developer Portal
 *   - GUILD_ID: Discord server ID where commands will be deployed
 * 
 * @module deploy_commands
 */

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./utils/logger');

require("dotenv").config();

// Load Discord bot configuration from environment variables
const { DISCORD_BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

/**
 * Command Collection Array
 * 
 * Stores all command definitions in JSON format for deployment to Discord.
 * Commands are automatically discovered from the commands directory structure.
 */
const commands = [];

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
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	
	// Process each command file in the folder
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		
		// Validate command structure and add to deployment array
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
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
(async () => {
	try {
		logger.info(`Started refreshing ${commands.length} application (/) commands.`);

		// Deploy commands to the specified guild
		const data = await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
			{ body: commands },
		);

		logger.info(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// Log any deployment errors for debugging
		logger.error(error);
	}
})();