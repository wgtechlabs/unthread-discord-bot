const { Events, EmbedBuilder } = require('discord.js'); // Added EmbedBuilder import
const { createTicket, bindTicketWithThread } = require('../services/unthread');
const { getKey, setKey } = require('../utils/memory');
require('dotenv').config();

const FORUM_CHANNEL_IDS = process.env.FORUM_CHANNEL_IDS ? 
    process.env.FORUM_CHANNEL_IDS.split(',') : [];

module.exports = {
    name: Events.ThreadCreate,
    async execute(thread) {
        if (!FORUM_CHANNEL_IDS.includes(thread.parentId)) return;

        console.log(`New forum post detected in monitored channel: ${thread.name}`);

        try {
            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMessage = messages.first();

            if (!firstMessage) {
                console.error(`Could not find the initial message for forum post: ${thread.id}`);
                return;
            }

            const author = firstMessage.author;
            const title = thread.name;
            const content = firstMessage.content;

            const customerKey = `customer:${author.id}`;
            const existingCustomer = await getKey(customerKey);
            let email = existingCustomer?.email || `${author.username}@discord.user`;

            if (!existingCustomer) {
                await setKey(customerKey, { email });
            }

            const ticket = await createTicket(author, title, content, email);
            if (!ticket.friendlyId) throw new Error('Ticket was created but no friendlyId was provided');

            await bindTicketWithThread(ticket.id, thread.id);

            // Create an embed for the ticket notification
            const ticketEmbed = new EmbedBuilder()
                .setColor(0xEB1A1A)
                .setTitle(`Support Ticket #${ticket.friendlyId}`)
                .setDescription('This forum post has been converted to a support ticket. The support team will respond here.')
                .addFields(
                    { name: 'Ticket ID', value: `#${ticket.friendlyId}`, inline: true },
                    { name: 'Status', value: 'Open', inline: true },
                    { name: 'Title', value: title, inline: false },
                    { name: 'Created By', value: author.tag, inline: true },
                    { name: 'Contact', value: email, inline: true }
                )
                .setFooter({ text: 'Unthread Support System' })
                .setTimestamp();

            await thread.send({ embeds: [ticketEmbed] });

            console.log(`Forum post converted to ticket: #${ticket.friendlyId}`);
        } catch (error) {
            console.error('Error creating ticket from forum post:', error);
            try {
                // Error embed
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Error Creating Support Ticket')
                    .setDescription('There was an error creating a support ticket from this forum post. A staff member will assist you shortly.')
                    .setFooter({ text: 'Unthread Support System' })
                    .setTimestamp();
                
                await thread.send({ embeds: [errorEmbed] });
            } catch (sendError) {
                console.error('Could not send error message to thread:', sendError);
            }
        }
    },
};
