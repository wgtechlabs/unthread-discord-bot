const { Events, ActivityType } = require('discord.js');
const packageJSON = require('../../package.json');
const logger = require('../utils/logger');
const { getValidatedForumChannelIds } = require('../utils/channelUtils');

/**
 * Client Ready Event Handler
 * 
 * This module executes once when the Discord client successfully connects and is ready.
 * It handles:
 * 1. Setting the bot's online presence and activity status
 * 2. Logging successful initialization with version information
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
 */
module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(bot) {
        // Explicitly set the bot's status to 'online' to ensure it appears online to users
        // This is important as sometimes Discord bots may default to 'idle' or not show proper status
        bot.user?.setPresence({
            status: 'online',
            activities: [{
                name: `support tickets`,
                type: ActivityType.Listening
            }]
            
        });

        // Log successful initialization with version information for monitoring
        logger.info(`Logged in as ${bot.user.tag} @ v${packageJSON.version}`);

        // Validate forum channel configuration on startup
        try {
            const validForumChannels = await getValidatedForumChannelIds();
            if (process.env.FORUM_CHANNEL_IDS) {
                const allChannelIds = process.env.FORUM_CHANNEL_IDS.split(',').map(id => id.trim()).filter(id => id);
                const invalidCount = allChannelIds.length - validForumChannels.length;
                
                if (invalidCount > 0) {
                    logger.warn(`⚠️  ${invalidCount} channel(s) in FORUM_CHANNEL_IDS are not forum channels and will be ignored`);
                }
                
                if (validForumChannels.length > 0) {
                    logger.info(`✅ Monitoring ${validForumChannels.length} forum channel(s) for ticket creation`);
                }
            }
        } catch (error) {
            logger.error('Error validating forum channels on startup:', error);
        }
    },
};