/**
 * Bot Utility Functions - Core Bot Information Management
 *
 * @description
 * Centralized utility functions providing consistent bot information access
 * across the application. Handles bot name resolution, footer generation,
 * and versioning for embeds and user-facing content.
 *
 * @module utils/botUtils
 * @since 1.0.0
 *
 * @keyFunctions
 * - getBotName(): Retrieves bot display name with fallback hierarchy
 * - getBotFooter(): Generates standardized footer text with name and version
 *
 * @commonIssues
 * - Client not available: Bot name fallback to package name when client unavailable
 * - Display name empty: Falls back to username when display name is whitespace
 * - Version mismatch: Footer shows outdated version if package.json not updated
 * - Global client undefined: Client not properly initialized in global scope
 *
 * @troubleshooting
 * - Check global.discordClient is properly set during bot initialization
 * - Verify bot has proper display name and username set in Discord
 * - Ensure package.json version is updated during releases
 * - Monitor fallback usage to detect client availability issues
 *
 * @performance
 * - Lightweight functions with minimal processing overhead
 * - Direct property access without complex operations
 * - Fallback hierarchy prevents errors from missing properties
 * - Version loaded once from package.json import
 *
 * @dependencies package.json version, global Discord client
 *
 * @example Basic Usage
 * ```typescript
 * const botName = getBotName(); // "My Discord Bot"
 * const footer = getBotFooter(); // "My Discord Bot v1.2.3"
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Use in embed creation
 * const embed = new EmbedBuilder()
 *   .setTitle('Support Ticket')
 *   .setFooter({ text: getBotFooter() });
 * ```
 */

import { version } from '../../package.json';

/**
 * Retrieves bot display name with intelligent fallback hierarchy
 *
 * @function getBotName
 * @returns {string} Bot's display name, username, or default fallback name
 *
 * @example
 * ```typescript
 * const botName = getBotName();
 * console.log(`Current bot: ${botName}`);
 * ```
 *
 * @troubleshooting
 * - Returns "Unthread Discord Bot" if global client not available
 * - Falls back to username if display name is empty or whitespace
 * - Check global.discordClient initialization if getting fallback name
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
