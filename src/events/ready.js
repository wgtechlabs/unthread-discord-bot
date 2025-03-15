const { Events, ActivityType } = require('discord.js');
const packageJSON = require('../../package.json');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(bot) {
        bot.user?.setPresence({
            activities: [{
                name: `support tickets`,
                type: ActivityType.Listening
            }]
            
        });

        console.log(`[online]: logged in as ${bot.user.tag} @ v${packageJSON.version}`);
    },
};