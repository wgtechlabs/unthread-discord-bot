/**
 * Smart Command Deployment Utility
 *
 * Efficiently manages Discord slash command registration by:
 * - Fetching existing commands from Discord API
 * - Comparing with local command definitions
 * - Only registering commands when there are actual changes
 * - Preventing unnecessary API calls and rate limiting
 *
 * @module utils/commandDeployment
 */

import { REST, Routes, Client } from 'discord.js';
import { LogEngine } from '../config/logger';

/**
 * Command comparison result
 */
interface CommandComparison {
needsUpdate: boolean;
added: string[];
modified: string[];
removed: string[];
unchanged: string[];
}

/**
 * Normalize command payload by removing Discord metadata fields
 * This prevents false positives in comparisons due to Discord-added metadata
 *
 * @param command - Raw command object from Discord API or local definition
 * @returns Normalized command object for comparison
 */
function normalizeCommand(command: Record<string, unknown>): string {
	const normalized = { ...command };

	// Remove only Discord-generated metadata that changes on every deployment
	// These fields are managed by Discord and should not affect deployment decisions
	delete normalized.id;
	delete normalized.application_id;
	delete normalized.version;

	// Preserve functional configuration fields that represent developer intent:
	// - default_member_permissions: Controls who can see/use the command
	// - dm_permission: Controls whether command works in direct messages
	// These fields should trigger deployments when changed

	// Create a shallow copy of options array to avoid mutating the original array
	// Preserve original order as it represents developer intent for parameter sequence
	if (Array.isArray(normalized.options)) {
		normalized.options = [...normalized.options];
	}

	return JSON.stringify(normalized);
}

/**
 * Compare local commands with Discord registered commands
 *
 * @param localCommands - Commands loaded from local files
 * @param discordCommands - Commands currently registered on Discord
 * @returns Comparison result with detailed changes
 */
function compareCommands(
	localCommands: Record<string, unknown>[],
	discordCommands: Record<string, unknown>[],
): CommandComparison {
	const result: CommandComparison = {
		needsUpdate: false,
		added: [],
		modified: [],
		removed: [],
		unchanged: [],
	};

	// Create maps for easier comparison using normalized commands
	const localMap = new Map(localCommands.map(cmd => [
		(cmd as { name: string }).name,
		normalizeCommand(cmd),
	]));

	const discordMap = new Map(discordCommands.map(cmd => [
		(cmd as { name: string }).name,
		normalizeCommand(cmd),
	]));

	// Check for added or modified commands
	for (const [name, localJson] of localMap) {
		if (!discordMap.has(name)) {
			result.added.push(name);
			result.needsUpdate = true;
		}
		else if (discordMap.get(name) !== localJson) {
			result.modified.push(name);
			result.needsUpdate = true;
		}
		else {
			result.unchanged.push(name);
		}
	}

	// Check for removed commands
	for (const [name] of discordMap) {
		if (!localMap.has(name)) {
			result.removed.push(name);
			result.needsUpdate = true;
		}
	}

	return result;
}

/**
 * Deploy commands only if needed
 *
 * Smart deployment that compares existing commands with local commands
 * and only makes API calls when there are actual changes.
 *
 * @param client - Discord client with commands collection
 * @returns Promise<boolean> - true if commands were deployed, false if skipped
 */
export async function deployCommandsIfNeeded(client: Client): Promise<boolean> {
	try {
		LogEngine.info('Checking if command deployment is needed...');

		const { DISCORD_BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

		if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
			LogEngine.warn('Skipping command deployment: Missing required environment variables (DISCORD_BOT_TOKEN, CLIENT_ID, or GUILD_ID)');
			return false;
		}

		// Get commands from client (need to cast to access commands property)
		const extendedClient = client as Client & { commands: Map<string, { data: { toJSON: () => Record<string, unknown> } }> };

		if (!extendedClient.commands) {
			LogEngine.warn('No commands collection found on client');
			return false;
		}

		// Convert local commands collection to JSON array
		const localCommands = Array.from(extendedClient.commands.values()).map(command => command.data.toJSON());

		if (localCommands.length === 0) {
			LogEngine.warn('No local commands found to deploy');
			return false;
		}

		// Initialize Discord REST client
		const rest = new REST().setToken(DISCORD_BOT_TOKEN);

		// Fetch existing commands from Discord
		LogEngine.debug('Fetching existing commands from Discord...');
		const existingCommands = await rest.get(
			Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
		) as Record<string, unknown>[];

		// Compare commands
		const comparison = compareCommands(localCommands, existingCommands);

		// Log comparison results
		if (comparison.needsUpdate) {
			const changes: string[] = [];
			if (comparison.added.length > 0) changes.push(`${comparison.added.length} added (${comparison.added.join(', ')})`);
			if (comparison.modified.length > 0) changes.push(`${comparison.modified.length} modified (${comparison.modified.join(', ')})`);
			if (comparison.removed.length > 0) changes.push(`${comparison.removed.length} removed (${comparison.removed.join(', ')})`);

			LogEngine.info(`Command changes detected: ${changes.join(', ')}`);
			LogEngine.info(`Deploying ${localCommands.length} commands to Discord...`);

			// Deploy commands to Discord API
			const data = await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
				{ body: localCommands },
			) as Record<string, unknown>[];

			LogEngine.info(`Successfully deployed ${data.length} slash commands to Discord API`);
			return true;
		}
		else {
			LogEngine.info(`Commands are up-to-date (${comparison.unchanged.length} commands unchanged) - skipping deployment`);
			return false;
		}
	}
	catch (error) {
		LogEngine.error('Failed to deploy commands to Discord:', error);
		// Rethrow the error so retry logic can handle it
		throw error;
	}
}
