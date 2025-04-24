/**
 * Unthread Service Module
 * 
 * This module handles all interaction with the Unthread API for the Discord bot.
 * It manages customer records, ticket creation/retrieval, and webhook event processing.
 * All communication between Discord and Unthread is managed through these functions.
 */

const { decodeHtmlEntities } = require('../utils/decodeHtmlEntities');
const { setKey, getKey } = require('../utils/memory');
const { withRetry } = require('../utils/retry');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { isDuplicateMessage, containsDiscordAttachments, processQuotedContent } = require('../utils/messageUtils');
const { findDiscordThreadByTicketId } = require('../utils/threadUtils');
const { getOrCreateCustomer, getCustomerByDiscordId } = require('../utils/customerUtils');
const { version } = require('../../package.json');

require('dotenv').config();

/**
 * ==================== CUSTOMER MANAGEMENT FUNCTIONS ====================
 * These functions handle creating and retrieving customer records in Unthread
 */

// These functions are now provided by customerUtils.js
// Maintaining these functions for backward compatibility but they delegate to customerUtils
async function saveCustomer(user, email) {
    return await getOrCreateCustomer(user, email);
}

async function getCustomerById(discordId) {
    return await getCustomerByDiscordId(discordId);
}

/**
 * ==================== TICKET MANAGEMENT FUNCTIONS ====================
 * These functions handle ticket creation and mapping between Discord threads and Unthread tickets
 */

/**
 * Creates a new support ticket in Unthread
 * 
 * @param {Object} user - Discord user object
 * @param {string} title - Ticket title
 * @param {string} issue - Ticket description/content
 * @param {string} email - User's email address
 * @returns {Object} - Unthread API response with ticket details
 * @throws {Error} - If ticket creation fails
 */
async function createTicket(user, title, issue, email) {
    const customer = await getOrCreateCustomer(user, email);

    const response = await fetch('https://api.unthread.io/api/conversations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.UNTHREAD_API_KEY,
        },
        body: JSON.stringify({
            type: 'email',
            title: title,
            markdown: `${issue}`,
            status: 'open',
            triageChannelId: process.env.UNTHREAD_TRIAGE_CHANNEL_ID,
            emailInboxId: process.env.UNTHREAD_EMAIL_INBOX_ID,
            customerId: customer.customerId,
            onBehalfOf: {
                name: user.tag,
                email: email,
                id: customer.customerId,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create ticket: ${response.status}`);
    }

    let data = await response.json();
    logger.debug('Initial ticket creation response:', JSON.stringify(data, null, 2));
    
    // If friendlyId is missing, fetch the ticket with retry until it's available
    if (!data.friendlyId && data.id) {
        logger.debug(`friendlyId not found in initial response. Fetching ticket ${data.id} with retry logic`);
        
        // Use our withRetry utility to poll for the friendlyId
        data = await withRetry(
            async () => {
                const ticketResponse = await fetch(`https://api.unthread.io/api/conversations/${data.id}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-KEY': process.env.UNTHREAD_API_KEY,
                    },
                });
                
                if (!ticketResponse.ok) {
                    throw new Error(`Failed to fetch ticket: ${ticketResponse.status}`);
                }
                
                const updatedData = await ticketResponse.json();
                
                // If friendlyId is still not available, throw an error to trigger retry
                if (!updatedData.friendlyId) {
                    throw new Error('friendlyId not yet available');
                }
                
                return updatedData;
            },
            {
                operationName: `Fetch ticket with friendlyId`,
                maxAttempts: 6,   // Total of 6 attempts
                baseDelayMs: 5000 // Start with 5s delay (subsequent delays: 10s, 15s, 20s, 25s)
            }
        );
        
        logger.info(`✅ Successfully retrieved ticket with friendlyId: ${data.friendlyId}`);
    }
    
    return data;
}

/**
 * Associates an Unthread ticket with a Discord thread for two-way communication
 * 
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @param {string} discordThreadId - Discord thread ID
 * @returns {Object} - Mapping object containing both IDs
 */
async function bindTicketWithThread(unthreadTicketId, discordThreadId) {
    const ticket = { 
        unthreadTicketId, 
        discordThreadId,
        createdAt: Date.now()
    };
    // Store with TTL = 0 for permanent persistence (no expiration)
    await setKey(`ticket:discord:${discordThreadId}`, ticket, 0);
    await setKey(`ticket:unthread:${unthreadTicketId}`, ticket, 0);
    logger.info(`Created persistent ticket mapping: Discord thread ${discordThreadId} <-> Unthread ticket ${unthreadTicketId}`);
    return ticket;
}

/**
 * Retrieves the ticket mapping by Discord thread ID
 * 
 * @param {string} discordThreadId - Discord thread ID
 * @returns {Object|null} - Ticket mapping or null if not found
 */
async function getTicketByDiscordThreadId(discordThreadId) {
    return await getKey(`ticket:discord:${discordThreadId}`);
}

/**
 * Retrieves the ticket mapping by Unthread ticket ID
 * 
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @returns {Object|null} - Ticket mapping or null if not found
 */
async function getTicketByUnthreadTicketId(unthreadTicketId) {
    return await getKey(`ticket:unthread:${unthreadTicketId}`);
}

/**
 * ==================== WEBHOOK EVENT HANDLER ====================
 * Processes incoming webhook events from Unthread
 */

/**
 * Main handler for incoming webhook events from Unthread
 * Processes ticket updates and new messages
 * 
 * @param {Object} payload - Webhook event payload from Unthread
 * @returns {Object} - The processed payload
 */
async function handleWebhookEvent(payload) {
    logger.debug('Received webhook event from Unthread:', payload);
    
    if (payload.event === 'conversation_updated') {
        const { id, status, friendlyId, title } = payload.data;
        if (status === 'closed') {
            try {
                const { discordThread } = await findDiscordThreadByTicketId(id, getTicketByUnthreadTicketId);
                
                const closedEmbed = new EmbedBuilder()
                    .setColor(0xEB1A1A)
                    .setTitle(`Ticket #${friendlyId || 'Unknown'} Closed`)
                    .setDescription('This support ticket has been closed by the support team.')
                    .addFields(
                        { name: 'Ticket ID', value: `#${friendlyId || id}`, inline: true },
                        { name: 'Status', value: 'Closed', inline: true }
                    )
                    .setFooter({ text: `Unthread Discord Bot v${version}` })
                    .setTimestamp();

                if (title) {
                    closedEmbed.addFields({ name: 'Title', value: title, inline: false });
                }

                await discordThread.send({ embeds: [closedEmbed] });
                logger.info(`Sent closure notification embed to Discord thread ${discordThread.id}`);
            } catch (error) {
                logger.error(`Unable to process ticket closure for ticket ${id}: ${error.message}`);
                return;
            }
        } else if (status === 'open') {
            try {
                const { discordThread } = await findDiscordThreadByTicketId(id, getTicketByUnthreadTicketId);
                
                const reopenedEmbed = new EmbedBuilder()
                    .setColor(0xEB1A1A)
                    .setTitle(`Ticket #${friendlyId || 'Unknown'} Reopened`)
                    .setDescription('This support ticket has been reopened. Our team will get back to you shortly.')
                    .addFields(
                        { name: 'Ticket ID', value: `#${friendlyId || id}`, inline: true },
                        { name: 'Status', value: 'Open', inline: true }
                    )
                    .setFooter({ text: `Unthread Discord Bot v${version}` })
                    .setTimestamp();

                if (title) {
                    reopenedEmbed.addFields({ name: 'Title', value: title, inline: false });
                }

                await discordThread.send({ embeds: [reopenedEmbed] });
                logger.info(`Sent reopen notification embed to Discord thread ${discordThread.id}`);
            } catch (error) {
                logger.error(`Unable to process ticket reopening for ticket ${id}: ${error.message}`);
                return;
            }
        }
        return;
    }
    
    if (payload.event === 'message_created') {
        if (payload.data.metadata && payload.data.metadata.source === "discord") {
            logger.debug("Message originated from Discord, skipping to avoid duplication");
            return;
        }
        
        // Extract timestamp from Slack-formatted message ID
        const messageId = payload.data.id;
        const slackTimestamp = messageId ? messageId.split('-').pop().split('.')[0] : null;
        
        if (slackTimestamp) {
            // Check if we have any records of a message deleted within a short window
            const currentTime = Date.now();
            const messageTimestamp = parseInt(slackTimestamp) * 1000; // Convert to milliseconds
            
            // Only process if the message isn't too old (prevents processing old messages)
            if (currentTime - messageTimestamp < 10000) { // Within 10 seconds
                // Check recent deleted messages in this channel
                const conversationId = payload.data.conversationId;
                const ticketMapping = await getTicketByUnthreadTicketId(conversationId);
                
                // If we can't find the thread mapping, proceed with sending the message
                if (!ticketMapping) {
                    logger.debug(`No Discord thread found for Unthread ticket ${conversationId}, proceeding with message`);
                } else {
                    const deletedMessagesKey = `deleted:channel:${ticketMapping.discordThreadId}`;
                    const recentlyDeletedMessages = await getKey(deletedMessagesKey) || [];
                    
                    // If there are any recently deleted messages in the last 5 seconds, 
                    // skip processing to avoid duplicates
                    if (recentlyDeletedMessages.length > 0) {
                        const hasRecentDeletions = recentlyDeletedMessages.some(item => 
                            currentTime - item.timestamp < 5000 // Within 5 seconds
                        );
                        
                        if (hasRecentDeletions) {
                            logger.info(`Skipping webhook processing for message - detected recent message deletions in thread ${ticketMapping.discordThreadId}`);
                            return;
                        }
                    }
                }
            }
        }

        const conversationId = payload.data.conversationId;
        const decodedMessage = decodeHtmlEntities(payload.data.text);
        try {
            const { discordThread } = await findDiscordThreadByTicketId(conversationId, getTicketByUnthreadTicketId);
            
            const messages = await discordThread.messages.fetch({ limit: 10 });
            const messagesArray = Array.from(messages.values());

            // Check if thread has at least 2 messages (initial message + ticket summary)
            if (messages.size >= 2) {
                // Check for duplicate messages using our utility function
                if (isDuplicateMessage(messagesArray, decodedMessage)) {
                    logger.debug('Duplicate message detected. Skipping send.');
                    return;
                }
                
                // Check ticket summary for duplicate content
                const sortedMessages = messagesArray.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                
                // New check: Is this a forum post with its original content being echoed back?
                // This specifically handles the case of forum posts having their content duplicated
                const firstMessage = sortedMessages[0];
                if (firstMessage && firstMessage.content.trim() === decodedMessage.trim()) {
                    logger.debug('Message appears to be echoing the initial forum post. Skipping to prevent duplication.');
                    return;
                }
                
                const ticketSummaryMessage = sortedMessages[1];
                
                if (ticketSummaryMessage && ticketSummaryMessage.content.includes(decodedMessage.trim())) {
                    logger.debug('Message content already exists in ticket summary. Skipping webhook message.');
                    return;
                }
            }

            // Check for Discord attachment patterns and skip if found
            if (containsDiscordAttachments(decodedMessage)) {
                logger.debug('Discord attachment links detected in webhook message. Skipping to avoid duplication.');
                return;
            }

            // Process quoted content and handle replies
            const { replyReference, contentToSend, isDuplicate } = processQuotedContent(decodedMessage, messagesArray);
            
            if (isDuplicate) {
                logger.debug('Reply content is a duplicate of an existing message. Skipping send.');
                return;
            }

            if (replyReference) {
                await discordThread.send({
                    content: contentToSend,
                    reply: { messageReference: replyReference },
                });
                logger.info(`Sent reply message to Discord message ${replyReference} in thread ${discordThread.id}`);
            } else {
                await discordThread.send(decodedMessage);
                logger.info(`Sent message to Discord thread ${discordThread.id}`);
            }
        } catch (error) {
            logger.error('Error processing new message webhook event:', error);
        }
    }
    return payload;
}

/**
 * Sends a message from Discord to Unthread
 * 
 * @param {string} conversationId - Unthread conversation/ticket ID
 * @param {Object} user - Discord user object
 * @param {string} message - Message content to send
 * @param {string} email - User's email address
 * @returns {Object} - Unthread API response
 * @throws {Error} - If sending the message fails
 */
async function sendMessageToUnthread(conversationId, user, message, email) {
    const response = await fetch(`https://api.unthread.io/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.UNTHREAD_API_KEY,
        },
        body: JSON.stringify({
            body: {
                type: "markdown",
                value: message,
            },
            isAutoresponse: false,
            onBehalfOf: {
                name: user.tag,
                email: email,
            },
            metadata: {
                source: "discord",
                discordMessageId: message.id || Date.now().toString(),
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to send message to Unthread: ${response.status}`);
    }

    return await response.json();
}

// Export all the public functions
module.exports = {
    saveCustomer,
    getCustomerById,
    createTicket,
    bindTicketWithThread,
    getTicketByDiscordThreadId,
    getTicketByUnthreadTicketId,
    handleWebhookEvent,
    sendMessageToUnthread,
};