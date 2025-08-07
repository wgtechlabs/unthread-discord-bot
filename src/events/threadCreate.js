/**
 * Thread Creation Event Handler
 * Converts new forum posts in validated forum channels to Unthread support tickets.
 * 
 * Now includes channel type validation to ensure only actual forum channels
 * are processed, preventing conflicts with text channels accidentally added
 * to FORUM_CHANNEL_IDS.
 */
const { Events, EmbedBuilder } = require('discord.js');
const { createTicket, bindTicketWithThread } = require('../services/unthread');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');
const { getOrCreateCustomer, getCustomerByDiscordId } = require('../utils/customerUtils');
const { isValidatedForumChannel } = require('../utils/channelUtils');
const { version } = require('../../package.json');
require('dotenv').config();

module.exports = {
    name: Events.ThreadCreate,
    async execute(thread) {
        // Ignore threads created in channels that are not validated forum channels.
        const isValidForum = await isValidatedForumChannel(thread.parentId);
        if (!isValidForum) return;

        logger.info(`New forum post detected in monitored channel: ${thread.name}`);

        try {
            // Fetch the first message with our retry mechanism
            const firstMessage = await withRetry(
                async () => {
                    const messages = await thread.messages.fetch({ limit: 1 });
                    const message = messages.first();
                    
                    if (!message) {
                        throw new Error('No message found in thread');
                    }
                    
                    return message;
                },
                {
                    operationName: 'Fetch initial forum post message',
                    maxAttempts: 12,    // Increased from 5 to 12 attempts
                    baseDelayMs: 10000  // Increased from 3000 to 10000 (10s)
                    // This will provide delays of: 10s, 20s, 30s... up to around 2 minutes total
                }
            );

            // Extract details from the forum post.
            const author = firstMessage.author;
            const title = thread.name;
            const content = firstMessage.content;

            // Retrieve or create customer using the new customerUtils module.
            const customer = await getOrCreateCustomer(author, `${author.username}@discord.user`);
            const email = customer.email;

            // Create a support ticket in Unthread using the forum post details.
            const ticket = await createTicket(author, title, content, email);

            // Link the Discord thread with the Unthread ticket for communication.
            await bindTicketWithThread(ticket.id, thread.id);

            // Notify users in the thread that a ticket has been created.
            const ticketEmbed = new EmbedBuilder()
                .setColor(0xEB1A1A)
                .setTitle(`Ticket #${ticket.friendlyId}`)
                .setDescription('This forum post has been converted to a support ticket. The support team will respond here.')
                .addFields(
                    { name: 'Ticket ID', value: `#${ticket.friendlyId}`, inline: true },
                    { name: 'Status', value: 'Open', inline: true },
                    { name: 'Title', value: title, inline: false },
                    { name: 'Created By', value: author.tag, inline: true }
                )
                .setFooter({ text: `Unthread Discord Bot v${version}` })
                .setTimestamp();

            await thread.send({ embeds: [ticketEmbed] });

            // Add the confirmation message similar to private threads
            await thread.send({
                content: `Hello <@${author.id}>, we have received your ticket and will respond shortly. Please check this thread for updates.`
            });

            logger.info(`Forum post converted to ticket: #${ticket.friendlyId}`);
        } catch (error) {
            if (error.message.includes('timeout')) {
                logger.error('Ticket creation is taking longer than expected. Please wait and try again.');
            } else {
                logger.error('An error occurred while creating the ticket:', error.message);
            }
            try {
                // Notify users in the thread about the error.
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Error Creating Support Ticket')
                    .setDescription('There was an error creating a support ticket from this forum post. A staff member will assist you shortly.')
                    .setFooter({ text: `Unthread Discord Bot v${version}` })
                    .setTimestamp();
                
                await thread.send({ embeds: [errorEmbed] });
            } catch (sendError) {
                logger.error('Could not send error message to thread:', sendError);
            }
        }
    },
};
