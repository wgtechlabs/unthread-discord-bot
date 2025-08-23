import { Events } from 'discord.js';
import * as logger from '../utils/logger';

/**
 * Global Discord.js Error Event Handler
 *
 * This module captures and logs unhandled errors from the Discord.js client.
 * These are typically lower-level errors like network issues, API problems,
 * or WebSocket connection failures that occur outside normal command execution.
 *
 * For debugging:
 * - Check network connectivity issues
 * - Verify Discord API status: https://discordstatus.com/
 * - Examine Discord developer portal for rate limits or token issues
 * - Review bot permissions in problematic servers
 */
export const name = Events.Error;
export const once = false;
export function execute(error: Error): void {
	// Log the error with full stack trace for troubleshooting
	logger.error(`Discord.js Client Error: ${error.stack || error}`);
}