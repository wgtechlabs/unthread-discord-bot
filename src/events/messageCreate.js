const { Events } = require("discord.js");
const { version } = require("../../package.json");
const { sendMessageToUnthread, Ticket, Customer } = require("../services/unthread");

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // If the message is in a thread, check for its mapping to forward to Unthread.
    if (message.channel.isThread()) {
      try {
        // Find the ticket mapping by Discord thread ID.
        const ticketMapping = await Ticket.findOne({ where: { discordThreadId: message.channel.id } });
        if (ticketMapping) {
          // Get the customer to retrieve the email
          const customer = await Customer.findByPk(message.author.id);
          if (!customer) {
            console.error(`Customer record not found for ${message.author.id}`);
          } else {
            const response = await sendMessageToUnthread(
              ticketMapping.unthreadTicketId,
              message.author,
              message.content,
              customer.email
            );
            console.log(`Forwarded message to Unthread for ticket ${ticketMapping.unthreadTicketId}`, response);
          }
        }
      } catch (error) {
        console.error("Error sending message to Unthread:", error);
      }
    }

    // Process regular commands

    // get the details from user who send command
    const member = message.member;
    const mention = message.mentions;

    // check ping
    if (message.content === "!!ping") {
      message.reply({
        embeds: [sendEmbedMessage(`Latency is ${Date.now() - message.createdTimestamp}ms.`)],
      });
      console.log(`[log]: responded to ping command`);
    }

    // check version
    if (message.content === "!!version") {
      message.reply({
        embeds: [sendEmbedMessage(`Version: ${version}`)],
      });
      console.log(`[log]: responded to version command in version ${version}`);
    }
  },
};