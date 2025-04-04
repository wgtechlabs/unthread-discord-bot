/**
 * Thread Creation Event Handler
 * Converts new forum posts in monitored channels to Unthread support tickets.
 */
const { Events, EmbedBuilder } = require('discord.js');
const { createTicket, bindTicketWithThread } = require('../services/unthread');
const { getKey, setKey } = require('../utils/memory');
const logger = require('../utils/logger');
require('dotenv').config();

// Retrieve forum channel IDs from environment variables.
// These channels are monitored for new threads to convert into tickets.
const FORUM_CHANNEL_IDS = process.env.FORUM_CHANNEL_IDS ? 
    process.env.FORUM_CHANNEL_IDS.split(',') : [];

module.exports = {
    name: Events.ThreadCreate,
    async execute(thread) {
        // Ignore threads created in channels not listed in FORUM_CHANNEL_IDS.
        if (!FORUM_CHANNEL_IDS.includes(thread.parentId)) return;

        logger.info(`New forum post detected in monitored channel: ${thread.name}`);

        try {
            // Fetch the first message in the thread (the original forum post).
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMessage = messages.first();

            if (!firstMessage) {
                logger.error(`Could not find the initial message for forum post: ${thread.id}`);
                return;
            }

            // Extract details from the forum post.
            const author = firstMessage.author;
            const title = thread.name;
            const content = firstMessage.content;

            // Check if the customer exists in memory; if not, create a default entry.
            const customerKey = `customer:${author.id}`;
            const existingCustomer = await getKey(customerKey);
            let email = existingCustomer?.email || `${author.username}@discord.user`;

            if (!existingCustomer) {
                await setKey(customerKey, { email });
            }

            // Create a support ticket in Unthread using the forum post details.
            const ticket = await createTicket(author, title, content, email);
            if (!ticket.friendlyId) throw new Error('Ticket was created but no friendlyId was provided');

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
                .setFooter({ text: 'Unthread Support System' })
                .setTimestamp();

            await thread.send({ embeds: [ticketEmbed] });

            // Add the confirmation message similar to private threads
            await thread.send({
                content: `Hello <@${author.id}>, we have received your ticket and will respond shortly. Please check this thread for updates.`
            });

            logger.info(`Forum post converted to ticket: #${ticket.friendlyId}`);
        } catch (error) {
            // Log and handle errors during ticket creation.
            logger.error('Error creating ticket from forum post:', error);
            try {
                // Notify users in the thread about the error.
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Error Creating Support Ticket')
                    .setDescription('There was an error creating a support ticket from this forum post. A staff member will assist you shortly.')
                    .setFooter({ text: 'Unthread Support System' })
                    .setTimestamp();
                
                await thread.send({ embeds: [errorEmbed] });
            } catch (sendError) {
                logger.error('Could not send error message to thread:', sendError);
            }
        }
    },
};
