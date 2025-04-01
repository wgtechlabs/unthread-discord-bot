/**
 * Unthread Service Module
 * 
 * This module handles all interaction with the Unthread API for the Discord bot.
 * It manages customer records, ticket creation/retrieval, and webhook event processing.
 * All communication between Discord and Unthread is managed through these functions.
 */

const { decodeHtmlEntities } = require('../utils/decodeHtmlEntities');
const { setKey, getKey } = require('../utils/memory');

require('dotenv').config();

/**
 * ==================== CUSTOMER MANAGEMENT FUNCTIONS ====================
 * These functions handle creating and retrieving customer records in Unthread
 */

/**
 * Creates a new customer in Unthread's system
 * 
 * @param {Object} user - Discord user object containing user details
 * @returns {string} - The Unthread customer ID
 * @throws {Error} - If API request fails or response is invalid
 */
async function createCustomerInUnthread(user) {
    const response = await fetch('https://api.unthread.io/api/customers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.UNTHREAD_API_KEY,
        },
        body: JSON.stringify({ name: user.username }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create customer: ${response.status}`);
    }

    const data = await response.json();
    const customerId = data.customerId || data.id;
    if (!customerId) {
        throw new Error(`Customer API response invalid, missing customerId: ${JSON.stringify(data)}`);
    }
    return customerId;
}

/**
 * Retrieves customer data or creates a new customer if not exists
 * 
 * @param {Object} user - Discord user object
 * @param {string} email - User's email address
 * @returns {Object} - Customer data object with Discord and Unthread IDs
 */
async function saveCustomer(user, email) {
    const key = `customer:${user.id}`;
    let existing = await getKey(key);
    if (existing) return existing;

    const customerId = await createCustomerInUnthread(user);
    const customer = {
        discordId: user.id,
        discordUsername: user.username,
        discordName: user.tag,
        customerId,
        email,
    };
    await setKey(key, customer);
    return customer;
}

/**
 * Retrieves a customer record by Discord user ID
 * 
 * @param {string} discordId - Discord user ID
 * @returns {Object|null} - Customer data object or null if not found
 */
async function getCustomerById(discordId) {
    return await getKey(`customer:${discordId}`);
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
    const customer = await saveCustomer(user, email);

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

    const data = await response.json();
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
    const ticket = { unthreadTicketId, discordThreadId };
    await setKey(`ticket:discord:${discordThreadId}`, ticket);
    await setKey(`ticket:unthread:${unthreadTicketId}`, ticket);
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
    console.log('Received webhook event from Unthread:', payload);
    
    if (payload.event === 'conversation_updated') {
        const { id, status } = payload.data;
        if (status === 'closed') {
            const ticketMapping = await getTicketByUnthreadTicketId(id);
            if (!ticketMapping) {
                console.error(`No Discord thread found for Unthread ticket ${id}`);
                return;
            }
            const discordThread = await global.discordClient.channels.fetch(ticketMapping.discordThreadId);
            if (!discordThread) {
                console.error(`Discord thread with ID ${ticketMapping.discordThreadId} not found.`);
                return;
            }
            await discordThread.send('> This ticket has been closed.');
            console.log(`Sent closure notification to Discord thread ${discordThread.id}`);
        } else if (status === 'open') {
            const ticketMapping = await getTicketByUnthreadTicketId(id);
            if (!ticketMapping) {
                console.error(`No Discord thread found for Unthread ticket ${id}`);
                return;
            }
            const discordThread = await global.discordClient.channels.fetch(ticketMapping.discordThreadId);
            if (!discordThread) {
                console.error(`Discord thread with ID ${ticketMapping.discordThreadId} not found.`);
                return;
            }
            await discordThread.send('> This ticket has been re-opened. Our team will get back to you shortly.');
            console.log(`Sent re-open notification to Discord thread ${discordThread.id}`);
        }
        return;
    }
    
    if (payload.event === 'message_created') {
        if (payload.data.metadata && payload.data.metadata.source === "discord") {
            console.log("Message originated from Discord, skipping to avoid duplication");
            return;
        }

        const conversationId = payload.data.conversationId;
        const decodedMessage = decodeHtmlEntities(payload.data.text);
        try {
            const ticketMapping = await getTicketByUnthreadTicketId(conversationId);
            if (!ticketMapping) {
                console.error(`No Discord thread found for Unthread ticket ${conversationId}`);
                return;
            }
            const discordThread = await global.discordClient.channels.fetch(ticketMapping.discordThreadId);
            if (!discordThread) {
                console.error(`Discord thread with ID ${ticketMapping.discordThreadId} not found.`);
                return;
            }
            console.log(`Found Discord thread: ${discordThread.id}`);

            const messages = await discordThread.messages.fetch({ limit: 10 });

            if (messages.size >= 2) {
                const messagesArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                const ticketSummaryMessage = messagesArray[1];
                
                if (ticketSummaryMessage && ticketSummaryMessage.content.includes(decodedMessage.trim())) {
                    console.log('Message content already exists in ticket summary. Skipping webhook message.');
                    return;
                }
                
                const duplicate = messages.some(msg => msg.content === decodedMessage);
                if (duplicate) {
                    console.log('Duplicate message detected. Skipping send.');
                    return;
                }
            }

            let quotedMessageMatch = decodedMessage.match(/^(>\s?.+(?:\n|$))+/);
            let replyReference = null;
            let contentToSend = decodedMessage;

            if (quotedMessageMatch) {
                let quotedMessage = quotedMessageMatch[0].trim();
                quotedMessage = quotedMessage.replace(/^>\s?/gm, '').trim();
                const remainingText = decodedMessage.replace(quotedMessageMatch[0], '').trim();
                console.log(`Message being used to search: ${quotedMessage}`);
                console.log(`Message being used to search: ${remainingText}`);
                const matchingMsg = messages.find(msg => msg.content.trim() === quotedMessage);
                if (matchingMsg) {
                    replyReference = matchingMsg.id;
                    contentToSend = remainingText || " ";
                    console.log(`Quoted text matched message ${matchingMsg.id}`);
                }

                const remainingTextDuplicate = messages.some(msg => msg.content.trim() === remainingText);
                if (remainingTextDuplicate) {
                    console.log('Remaining text matches an existing message. Skipping send.');
                    return;
                }
            }

            if (replyReference) {
                await discordThread.send({
                    content: contentToSend,
                    reply: { messageReference: replyReference },
                });
                console.log(`Sent reply message to Discord message ${replyReference} in thread ${discordThread.id}`);
            } else {
                await discordThread.send(decodedMessage);
                console.log(`Sent message to Discord thread ${discordThread.id}`);
            }
        } catch (error) {
            console.error('Error processing new message webhook event:', error);
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