/**
 * Thread Creation Event Handler
 * Converts new forum posts in validated forum channels to Unthread support tickets.
 * 
 * Now includes channel type validation to ensure only actual forum channels
 * are processed, preventing conflicts with text channels accidentally added
 * to FORUM_CHANNEL_IDS.
 */
const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
        try {
            // Ignore threads created in channels that are not validated forum channels.
            const isValidForum = await isValidatedForumChannel(thread.parentId);
            if (!isValidForum) return;
        } catch (error) {
            logger.error('❌ Error validating forum channel:', error.message);
            logger.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
            logger.error('⚠️ Skipping thread processing due to validation error');
            return;
        }

        logger.info(`New forum post detected in monitored channel: ${thread.name}`);

        // Check bot permissions before proceeding with any Discord actions
        const botMember = thread.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.SendMessages
        ];

        // Check permissions in the parent forum channel
        const parentChannel = thread.parent;
        const parentPermissions = botMember.permissionsIn(parentChannel);
        if (!parentPermissions.has(requiredPermissions)) {
            const missingPermissions = requiredPermissions.filter(perm => !parentPermissions.has(perm));
            const permissionNames = missingPermissions.map(perm => {
                switch(perm) {
                    case PermissionFlagsBits.SendMessagesInThreads: return 'Send Messages in Threads';
                    case PermissionFlagsBits.ViewChannel: return 'View Channel';
                    case PermissionFlagsBits.ReadMessageHistory: return 'Read Message History';
                    case PermissionFlagsBits.SendMessages: return 'Send Messages';
                    default: return 'Unknown Permission';
                }
            });
            
            logger.error(`❌ Cannot create support tickets in forum channel "${parentChannel.name}" (${parentChannel.id})`);
            logger.error(`Missing permissions: ${permissionNames.join(', ')}`);
            logger.error(`Action required: Ask a server administrator to grant the bot these permissions in the forum channel.`);
            logger.error(`Guild: ${thread.guild.name} (${thread.guild.id})`);
            return;
        }

        // Also check permissions specifically in the thread
        const threadPermissions = botMember.permissionsIn(thread);
        const threadRequiredPermissions = [
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory
        ];
        
        if (!threadPermissions.has(threadRequiredPermissions)) {
            const missingThreadPermissions = threadRequiredPermissions.filter(perm => !threadPermissions.has(perm));
            const threadPermissionNames = missingThreadPermissions.map(perm => {
                switch(perm) {
                    case PermissionFlagsBits.SendMessagesInThreads: return 'Send Messages in Threads';
                    case PermissionFlagsBits.ViewChannel: return 'View Channel';
                    case PermissionFlagsBits.ReadMessageHistory: return 'Read Message History';
                    default: return 'Unknown Permission';
                }
            });
            
            logger.error(`❌ Cannot process forum thread "${thread.name}" (${thread.id})`);
            logger.error(`Missing thread permissions: ${threadPermissionNames.join(', ')}`);
            logger.error(`Action required: Ask a server administrator to grant the bot these permissions for forum threads.`);
            logger.error(`Guild: ${thread.guild.name} (${thread.guild.id})`);
            return;
        }

        logger.info(`✅ Permission check passed for forum thread "${thread.name}" in channel "${parentChannel.name}"`);

        let firstMessage; // Declare in higher scope for error logging access

        try {
            // Fetch the first message with our retry mechanism
            firstMessage = await withRetry(
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
                logger.error('⏱️ Ticket creation is taking longer than expected. Please wait and try again.');
                logger.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
            } else {
                logger.error('❌ An error occurred while creating the ticket:', error.message);
                logger.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
                logger.error(`Author: ${firstMessage?.author?.tag || 'Unknown'} (${firstMessage?.author?.id || 'Unknown'})`);
            }
            
            try {
                // Only attempt to send error message if we have the necessary permissions
                const canSendMessages = botMember.permissionsIn(thread).has([
                    PermissionFlagsBits.SendMessagesInThreads,
                    PermissionFlagsBits.ViewChannel
                ]);
                
                if (canSendMessages) {
                    // Notify users in the thread about the error.
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('Error Creating Support Ticket')
                        .setDescription('There was an error creating a support ticket from this forum post. A staff member will assist you shortly.')
                        .setFooter({ text: `Unthread Discord Bot v${version}` })
                        .setTimestamp();
                    
                    await thread.send({ embeds: [errorEmbed] });
                    logger.info('📧 Sent error notification to user in thread');
                } else {
                    logger.warn('⚠️ Cannot send error message to user - missing permissions');
                    logger.warn('💡 Users will not be notified of the ticket creation failure');
                    logger.warn('🔧 Administrator action required: Grant bot "Send Messages in Threads" and "View Channel" permissions');
                }
            } catch (sendError) {
                logger.error('❌ Could not send error message to thread:', sendError.message);
                if (sendError.code === 50001) {
                    logger.error('🔐 Error Code 50001: Missing Access - Bot lacks permission to send messages in this thread');
                    logger.error('🔧 Administrator action required: Grant bot "Send Messages in Threads" permission');
                }
                logger.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
            }
        }
    },
};
