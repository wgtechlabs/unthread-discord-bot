const { Sequelize, DataTypes } = require('sequelize');
const { decodeHtmlEntities } = require('../utils/decodeHtmlEntities');
require('dotenv').config();

// Initialize Sequelize using SQLite (adjust storage as needed)
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

// Define the Customer model with Discord ID as the primary key
const Customer = sequelize.define('Customer', {
    discordId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
    discordUsername: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    customerId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: 'customers',
    timestamps: true,
});

// Define a new Ticket model to bind Unthread ticket with Discord thread
const Ticket = sequelize.define('Ticket', {
    unthreadTicketId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
    discordThreadId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: 'tickets',
    timestamps: true,
});

// Sync the models with the database
sequelize.sync();

// Function to call the unthread.io API to create a customer
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

// Save the customer details locally using Sequelize.
// Modified to accept the email parameter.
async function saveCustomer(user, email) {
    const existing = await Customer.findByPk(user.id);
    if (existing) return existing;

    const customerId = await createCustomerInUnthread(user);
    return await Customer.create({
        discordId: user.id,
        discordUsername: user.username,
        discordName: user.tag,
        customerId,
        email,
    });
}

// Function to create a ticket via unthread.io API using the customerId
async function createTicket(user, title, issue, email) {
    // Ensure the user has a customer record (creates one if needed)
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

// Helper function to bind an Unthread ticket with a Discord thread
async function bindTicketWithThread(unthreadTicketId, discordThreadId) {
    return await Ticket.create({
        unthreadTicketId,
        discordThreadId,
    });
}

// New function to process incoming webhook events from unthread.io
async function handleWebhookEvent(payload) {
    console.log('Received webhook event from Unthread:', payload);
    if (payload.event === 'message_created') {
        const conversationId = payload.data.conversationId;
        // Decode HTML entities here
        const decodedMessage = decodeHtmlEntities(payload.data.text);
        try {
            const ticketMapping = await Ticket.findOne({ where: { unthreadTicketId: conversationId } });
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

            // Fetch recent messages in the thread
            const messages = await discordThread.messages.fetch({ limit: 10 });

            // Log the decoded message
            console.log(`Decoded message: ${decodedMessage}`);

            // Attempt to find a quoted block (lines starting with ">")
            let quotedMessageMatch = decodedMessage.match(/^(>\s?.+(?:\n|$))+/);
            let replyReference = null;
            let contentToSend = decodedMessage;

            if (quotedMessageMatch) {
                let quotedMessage = quotedMessageMatch[0].trim();
                // Remove the ">" character from the quoted text
                quotedMessage = quotedMessage.replace(/^>\s?/gm, '').trim();
                // Remove the quoted block from the message if any additional text remains
                const remainingText = decodedMessage.replace(quotedMessageMatch[0], '').trim();
                // Log the message being used to search
                console.log(`Message being used to search: ${quotedMessage}`);
                console.log(`Message being used to search: ${remainingText}`);
                // Search for a matching message among the recently fetched ones
                const matchingMsg = messages.find(msg => msg.content.trim() === quotedMessage);
                if (matchingMsg) {
                    replyReference = matchingMsg.id;
                    // Use only the remaining text; if empty, use a single space placeholder
                    contentToSend = remainingText || " ";
                    console.log(`Quoted text matched message ${matchingMsg.id}`);
                }

                // Check if the remaining text matches any message content
                const remainingTextDuplicate = messages.some(msg => msg.content.trim() === remainingText);
                if (remainingTextDuplicate) {
                    console.log('Remaining text matches an existing message. Skipping send.');
                    return;
                }
            }

            // Check for duplicate candidate messages
            const duplicate = messages.some(msg => msg.content === decodedMessage);
            if (duplicate) {
                console.log('Duplicate message detected. Skipping send.');
                return;
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

// New function to send a message from Discord to Unthread
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
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to send message to Unthread: ${response.status}`);
    }

    return await response.json();
}

module.exports = {
    Customer,
    Ticket,
    sequelize,
    saveCustomer,
    createTicket,
    bindTicketWithThread,
    handleWebhookEvent,
    sendMessageToUnthread,
};