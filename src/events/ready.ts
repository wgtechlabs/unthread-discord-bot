/**
 * Client Ready Event Handler - Bot Initialization
 *
 * @description
 * Handles bot initialization when Discord client successfully connects and receives
 * READY payload. Manages presence setting, command deployment, forum channel validation,
 * and startup logging for monitoring and debugging purposes.
 *
 * @module events/ready
 * @since 1.0.0
 *
 * @keyFunctions
 * - execute(): Main initialization handler setting presence, deploying commands, validating channels
 *
 * @commonIssues
 * - Ready event not firing: Invalid bot token or network connectivity problems
 * - Command deployment failures: Insufficient bot permissions or Discord API issues
 * - Forum channel validation errors: Invalid channel IDs or wrong channel types
 * - Presence not updating: Discord caching or rate limiting status updates
 * - Process exit on critical failures: Command deployment retry exhaustion
 *
 * @troubleshooting
 * - Verify bot token validity and permissions in Discord Developer Portal
 * - Check network connectivity and Discord API status at https://discordstatus.com/
 * - Ensure bot has "Use Slash Commands" permission where commands are deployed
 * - Validate FORUM_CHANNEL_IDS contains actual forum channel IDs
 * - Monitor LogEngine output for specific error messages and retry attempts
 * - Check bot permissions in target guilds for presence and activity updates
 *
 * @performance
 * - Executes only once per bot session using 'once: true' configuration
 * - Command deployment uses exponential backoff retry (2s, 4s, 8s intervals)
 * - Forum channel validation batched to minimize API calls
 * - Presence setting optimized to avoid unnecessary Discord API requests
 *
 * @dependencies Discord.js Events, channelUtils, commandDeployment, retry utility
 *
 * @example Basic Usage
 * ```typescript
 * // Event automatically registered by Discord.js event system
 * client.once(Events.ClientReady, readyEvent.execute);
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Custom ready handler with additional initialization
 * const customReady = {
 *   name: Events.ClientReady,
 *   once: true,
 *   async execute(client: Client) {
 *     await readyEvent.execute(client);
 *     // Additional custom initialization
 *   }
 * };
 * ```
 */

import { Events, ActivityType, Client } from 'discord.js';
import * as packageJSON from '../../package.json';
import { LogEngine } from '../config/logger';
import channelUtils from '../utils/channelUtils';
import { deployCommandsIfNeeded } from '../utils/commandDeployment';
import { withRetry } from '../utils/retry';

const { getValidatedForumChannelIds } = channelUtils;


/**
 * Ready event handler
 */
const readyEvent = {
	name: Events.ClientReady,
	once: true,

	/**
	 * Initializes bot when Discord client is ready and connected
	 *
	 * @async
	 * @function execute
	 * @param {Client} bot - Discord client instance with established connection
	 * @returns {Promise<void>} Resolves after successful initialization or exits on critical failure
	 *
	 * @example
	 * ```typescript
	 * // Automatically called by Discord.js when bot connects
	 * // Sets presence, deploys commands, validates forum channels
	 * ```
	 *
	 * @troubleshooting
	 * - Process exits on command deployment failure after retries
	 * - Forum channel warnings logged for invalid configurations
	 * - Presence updates may be rate-limited by Discord
	 * - Command deployment requires proper bot permissions
	 */
	async execute(bot: Client): Promise<void> {
		// Explicitly set the bot's status to 'online' to ensure it appears online to users
		// This is important as sometimes Discord bots may default to 'idle' or not show proper status
		bot.user?.setPresence({
			status: 'online',
			activities: [{
				name: 'support tickets',
				type: ActivityType.Listening,
			}],
		});

		// Log successful initialization with version information for monitoring
		LogEngine.info(`Logged in as ${bot.user?.displayName || bot.user?.username} @ v${packageJSON.version}`);

		// Deploy Discord slash commands using smart deployment utility with retry strategy
		// This ensures command registration is guaranteed or the bot fails definitively
		// Uses exponential backoff: 2s, 4s, 8s for critical startup operations
		try {
			await withRetry(
				async () => {
					await deployCommandsIfNeeded(bot);
				},
				{
					operationName: 'Discord command deployment',
					exponentialBackoff: true,
					maxAttempts: 3,
					baseDelayMs: 2000,
				},
			);
		}
		catch (deployError) {
			LogEngine.error('Critical failure: Discord command deployment failed after all retry attempts. Bot startup aborted.', deployError);
			process.exit(1);
		}

		// Validate forum channel configuration on startup
		try {
			const validForumChannels = await getValidatedForumChannelIds();
			if (process.env.FORUM_CHANNEL_IDS) {
				const allChannelIds = process.env.FORUM_CHANNEL_IDS.split(',').map(id => id.trim()).filter(id => id);
				const invalidCount = allChannelIds.length - validForumChannels.length;

				if (invalidCount > 0) {
					LogEngine.warn(`${invalidCount} channel(s) in FORUM_CHANNEL_IDS are not forum channels and will be ignored`);
				}

				if (validForumChannels.length > 0) {
					LogEngine.info(`Monitoring ${validForumChannels.length} forum channel(s) for ticket creation`);
				}
			}
		}
		catch (error) {
			LogEngine.error('Error validating forum channels on startup:', error);
		}
	},
};

export default readyEvent;