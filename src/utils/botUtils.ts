/**
 * Bot Utility Functions
 *
 * Provides utility functions for bot-related operations and information retrieval.
 * These functions help maintain consistency across the application when referencing
 * bot details and improve maintainability by centralizing bot-related logic.
 *
 * @module utils/botUtils
 */

import { version } from '../../package.json';

/**
 * Gets the actual bot display name from the Discord client
 *
 * Attempts to retrieve the bot's display name from the global Discord client.
 * Falls back to username if display name is not available, and finally to
 * a default name if the client is not available or not ready.
 *
 * @returns The bot's display name, username, or default fallback
 *
 * @example
 * ```typescript
 * const botName = getBotName();
 * console.log(`Bot name: ${botName}`); // "My Cool Bot" or "unthread-discord-bot"
 * ```
 */
export function getBotName(): string {
	const client = global.discordClient;

	if (client?.user?.displayName && client.user.displayName.trim()) {
		return client.user.displayName;
	}

	if (client?.user?.username && client.user.username.trim()) {
		return client.user.username;
	}

	// Fallback to package name if client is not available
	return 'Unthread Discord Bot';
}

/**
 * Gets a formatted footer text with bot name and version
 *
 * Creates a standardized footer text that includes the bot's actual name
 * and current version. This ensures consistency across all embeds and
 * automatically updates when the bot name or version changes.
 *
 * @returns Formatted footer text with bot name and version
 *
 * @example
 * ```typescript
 * const footerText = getBotFooter();
 * embed.setFooter({ text: footerText });
 * // Result: "My Cool Bot v1.0.0-rc1"
 * ```
 */
export function getBotFooter(): string {
	const botName = getBotName();
	return `${botName} v${version}`;
}

/**
 * Gets just the bot name without version for general use
 *
 * Provides the bot's actual name for use in messages, logs, or other
 * contexts where version information is not needed.
 *
 * @returns The bot's display name or username
 *
 * @example
 * ```typescript
 * const name = getBotDisplayName();
 * LogEngine.info(`${name} is starting up...`);
 * ```
 */
export function getBotDisplayName(): string {
	return getBotName();
}
