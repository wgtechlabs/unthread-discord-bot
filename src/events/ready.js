const { Events, ActivityType } = require('discord.js');
const packageJSON = require('../../package.json');
const logger = require('../utils/logger');

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
    execute(bot) {
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
    },
};