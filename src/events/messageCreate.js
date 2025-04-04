const { Events } = require("discord.js");
const { version } = require("../../package.json");
const { sendMessageToUnthread, getTicketByDiscordThreadId, getCustomerById } = require("../services/unthread");
const { FORUM_CHANNEL_IDS } = process.env;
const logger = require("../utils/logger");

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // If the message is in a thread, check for its mapping to forward to Unthread.
    if (message.channel.isThread()) {
      try {
        const isForumPost = FORUM_CHANNEL_IDS && 
                            FORUM_CHANNEL_IDS.split(',').includes(message.channel.parentId) &&
                            message.id === message.channel.id;

        if (isForumPost) return;

        // Retrieve the ticket mapping by Discord thread ID using Keyv
        const ticketMapping = await getTicketByDiscordThreadId(message.channel.id);
        if (ticketMapping) {
          let messageToSend = message.content;
          if (message.reference && message.reference.messageId) {
            let quotedMessage;
            try {
              const referenced = await message.channel.messages.fetch(message.reference.messageId);
              quotedMessage = `> ${referenced.content}`;
              messageToSend = `${quotedMessage}\n\n${message.content}`;
            } catch (err) {
              logger.error('Error fetching the referenced message:', err);
            }
          }

          // Get the customer using Redis
          const customer = await getCustomerById(message.author.id);
          const email = customer?.email || `${message.author.username}@discord.user`;

          const response = await sendMessageToUnthread(
            ticketMapping.unthreadTicketId,
            message.author,
            messageToSend,
            email
          );
          logger.info(`Forwarded message to Unthread for ticket ${ticketMapping.unthreadTicketId}`, response);
        }
      } catch (error) {
        logger.error("Error sending message to Unthread:", error);
      }
    }

    // Legacy commands
    handleLegacyCommands(message);
  },
};

async function handleLegacyCommands(message) {
  // check ping
  if (message.content === "!!ping") {
    message.reply(`Latency is ${Date.now() - message.createdTimestamp}ms.`);
    logger.info(`responded to ping command`);
  }

  // check version
  if (message.content === "!!version") {
    message.reply(`Version: ${version}`);
    logger.info(`responded to version command in version ${version}`);
  }
}