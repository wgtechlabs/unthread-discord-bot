/**
 * Client Ready Event Handler
 *
 * This module executes once when the Discord client successfully connects and is ready.
 * It handles:
 * 1. Setting the bot's online presence and activity status
 * 2. Logging successful initialization with version information
 * 3. Validating forum channel configuration
 *
 * This event is crucial as it confirms the bot has:
 * - Successfully authenticated with Discord's Gateway
 * - Received the READY payload from Discord
 * - Cached guilds, channels, and other Discord entities
 *
 * For debugging:
 * - If this event doesn't fire, check bot token validity
 * - Verify network connectivity and Discord API status
 * - Check for excessive rate limiting that might prevent connection
 *
 * @module events/ready
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
	 * Executes when the Discord client is ready
	 *
	 * @param bot - The Discord client instance
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