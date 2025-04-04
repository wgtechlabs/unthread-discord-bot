const { Events, ActivityType } = require('discord.js');
const packageJSON = require('../../package.json');
const logger = require('../utils/logger');

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

        logger.info(`Logged in as ${bot.user.tag} @ v${packageJSON.version}`);
    },
};