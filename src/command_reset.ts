/**
 * Command Reset Tool
 *
 * Complete command removal utility for Discord slash commands.
 * This tool removes all registered commands from the Discord guild,
 * providing a clean slate for testing or redeployment.
 *
 * Features:
 * - Complete command removal
 * - Safety confirmation prompt
 * - Detailed logging with LogEngine
 * - Environment validation
 * - Error handling with proper exit codes
 *
 * Usage:
 *   yarn cmd:reset
 *   node dist/command_reset.js
 *
 * Environment Variables Required:
 *   - DISCORD_BOT_TOKEN: Bot token from Discord Developer Portal
 *   - CLIENT_ID: Application ID from Discord Developer Portal
 *   - GUILD_ID: Discord server ID where commands will be removed
 *
 * @module command_reset
 */

import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import * as readline from 'node:readline';
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
 * Get existing commands from Discord API
 *
 * @returns Array of currently registered commands
 */
async function getExistingCommands(): Promise<Record<string, unknown>[]> {
	// Initialize Discord REST client
	const rest = new REST().setToken(DISCORD_BOT_TOKEN!);

	try {
		LogEngine.info('Fetching existing commands from Discord...');
		const commands = await rest.get(
			Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID!),
		) as Record<string, unknown>[];

		LogEngine.info(`Found ${commands.length} existing commands`);
		return commands;
	}
	catch (error) {
		LogEngine.error('Failed to fetch existing commands:', error);
		throw error;
	}
}

/**
 * Ask for user confirmation before proceeding with reset
 *
 * @param commandCount Number of commands that will be removed
 * @returns Promise<boolean> true if user confirms, false otherwise
 */
function askForConfirmation(commandCount: number): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const message = commandCount > 0
			? `This will remove ${commandCount} commands from Discord. Are you sure? (y/N): `
			: 'No commands found to remove. Continue anyway? (y/N): ';

		rl.question(message, (answer) => {
			rl.close();
			const confirmed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
			resolve(confirmed);
		});
	});
}

/**
 * Reset (remove) all commands from Discord API
 */
async function resetCommands(): Promise<void> {
	// Initialize Discord REST client
	const rest = new REST().setToken(DISCORD_BOT_TOKEN!);

	LogEngine.info('Removing all commands from Discord...');

	try {
		// Remove all commands by sending an empty array
		await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID!),
			{ body: [] },
		);

		LogEngine.info('Successfully removed all slash commands from Discord API');
		LogEngine.info('All commands have been unregistered and are no longer available in Discord');
	}
	catch (error) {
		LogEngine.error('Command reset failed:', error);
		process.exit(1);
	}
}

/**
 * Main reset process
 */
async function main(): Promise<void> {
	LogEngine.info('Starting command reset process...');

	// Validate environment
	validateEnvironment();

	// Get existing commands for confirmation
	const existingCommands = await getExistingCommands();

	// Show current commands if any exist
	if (existingCommands.length > 0) {
		LogEngine.info('Current registered commands:');
		existingCommands.forEach((cmd) => {
			const command = cmd as { name: string; description?: string };
			LogEngine.info(`  - ${command.name}${command.description ? ': ' + command.description : ''}`);
		});
	}
	else {
		LogEngine.info('No commands are currently registered');
	}

	// Ask for confirmation
	const confirmed = await askForConfirmation(existingCommands.length);

	if (!confirmed) {
		LogEngine.info('Command reset cancelled by user');
		return;
	}

	// Reset commands
	await resetCommands();

	LogEngine.info('Command reset completed successfully');
}

// Execute main function
main().catch((error) => {
	LogEngine.error('Unexpected error during reset:', error);
	process.exit(1);
});
