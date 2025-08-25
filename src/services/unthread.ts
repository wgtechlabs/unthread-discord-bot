/**
 * Unthread Service Module
 *
 * This module handles all interaction with the Unthread API for the Discord bot.
 * It manages customer records, ticket creation/retrieval, and webhook event processing.
 * All communication between Discord and Unthread is managed through these functions.
 *
 * Key Features:
 * - Customer creation and management
 * - Ticket creation and status updates
 * - Webhook event processing for real-time synchronization
 * - Message forwarding between Discord and Unthread
 * - Thread-to-ticket mapping management
 *
 * @module services/unthread
 */

import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';
import { setKey, getKey } from '../utils/memory';
import { EmbedBuilder, User } from 'discord.js';
import { LogEngine } from '../config/logger';
import { isDuplicateMessage, containsDiscordAttachments, processQuotedContent } from '../utils/messageUtils';
import { findDiscordThreadByTicketId, findDiscordThreadByTicketIdWithRetry } from '../utils/threadUtils';
import { getOrCreateCustomer, getCustomerByDiscordId } from '../utils/customerUtils';
import { version } from '../../package.json';

interface TicketMapping {
    unthreadTicketId: string;
    discordThreadId: string;
}

interface UnthreadTicket {
    id: string;
    friendlyId: string;
    title: string;
    status: string;
    customerId?: string;
}

interface UnthreadCustomer {
    customerId: string;
    email: string;
    discordId: string;
    discordUsername: string;
    discordName: string;
}

interface WebhookPayload {
    event: string;
    data: {
        id: string;
        conversationId?: string;
        conversation?: {
            id: string;
            friendlyId: string;
            title: string;
            status: string;
        };
        message?: {
            id: string;
            markdown: string;
            authorName: string;
            authorEmail: string;
            createdAt: string;
        };
    };
}

/**
 * ==================== CUSTOMER MANAGEMENT FUNCTIONS ====================
 * These functions handle creating and retrieving customer records in Unthread
 */

/**
 * Legacy wrapper for customer creation (now delegates to customerUtils)
 *
 * @deprecated Use getOrCreateCustomer from customerUtils directly
 * @param {User} user - Discord user object
 * @param {string} email - User's email address
 * @returns {UnthreadCustomer} Customer data object
 */
export async function saveCustomer(user: User, email: string): Promise<UnthreadCustomer> {
	return await getOrCreateCustomer(user, email);
}

/**
 * Legacy wrapper for customer retrieval (now delegates to customerUtils)
 *
 * @deprecated Use getCustomerByDiscordId from customerUtils directly
 * @param {string} discordId - Discord user ID
 * @returns {UnthreadCustomer|null} Customer data object or null if not found
 */
export async function getCustomerById(discordId: string): Promise<UnthreadCustomer | null> {
	return await getCustomerByDiscordId(discordId);
}

/**
 * ==================== TICKET MANAGEMENT FUNCTIONS ====================
 * These functions handle ticket creation and mapping between Discord threads and Unthread tickets
 */

/**
 * Creates a new support ticket in Unthread
 *
 * @param {User} user - Discord user object
 * @param {string} title - Ticket title
 * @param {string} issue - Ticket description/content
 * @param {string} email - User's email address
 * @returns {UnthreadTicket} - Unthread API response with ticket details
 * @throws {Error} - If ticket creation fails
 */
export async function createTicket(user: User, title: string, issue: string, email: string): Promise<UnthreadTicket> {
	// Enhanced debugging: Initial request context
	LogEngine.info(`Creating ticket for user: ${user.tag} (${user.id})`);
	LogEngine.debug(`Env: API_KEY=${process.env.UNTHREAD_API_KEY ? process.env.UNTHREAD_API_KEY.length + 'chars' : 'NOT_SET'}, TRIAGE_ID=${JSON.stringify(process.env.UNTHREAD_TRIAGE_CHANNEL_ID || 'NOT_SET')}, INBOX_ID=${JSON.stringify(process.env.UNTHREAD_EMAIL_INBOX_ID || 'NOT_SET')}`);

	const customer = await getOrCreateCustomer(user, email);
	LogEngine.debug(`Customer: ${customer?.customerId || 'unknown'} (${customer?.email || email})`);

	const requestPayload = {
		type: 'email',
		title: title,
		markdown: `${issue}`,
		status: 'open',
		triageChannelId: process.env.UNTHREAD_TRIAGE_CHANNEL_ID?.trim(),
		emailInboxId: process.env.UNTHREAD_EMAIL_INBOX_ID?.trim(),
		customerId: customer?.customerId,
		onBehalfOf: {
			name: user.tag,
			email: email,
		},
	};

	LogEngine.info('POST https://api.unthread.io/api/conversations');
	LogEngine.debug(`Payload: ${JSON.stringify(requestPayload)}`);

	const response = await fetch('https://api.unthread.io/api/conversations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-KEY': process.env.UNTHREAD_API_KEY as string,
		},
		body: JSON.stringify(requestPayload),
	});

	LogEngine.debug(`Response status: ${response.status}`);

	if (!response.ok) {
		const errorText = await response.text();
		LogEngine.error(`Failed to create ticket: ${response.status} - ${errorText}`);
		throw new Error(`Failed to create ticket: ${response.status}`);
	}

	const data = await response.json();
	LogEngine.info('Ticket created successfully:', data);

	// Validate required fields in response
	if (!data.id) {
		LogEngine.error('Ticket response missing required \'id\' field:', data);
		throw new Error('Ticket was created but response is missing required fields');
	}

	if (!data.friendlyId) {
		LogEngine.error('Ticket response missing required \'friendlyId\' field:', data);
		throw new Error('Ticket was created but friendlyId is missing');
	}

	LogEngine.info(`Created ticket ${data.friendlyId} (${data.id}) for user ${user.tag}`);
	return data as UnthreadTicket;
}

/**
 * Binds a Discord thread to an Unthread ticket
 *
 * Creates a bidirectional mapping in the cache to enable message forwarding
 * and webhook event routing between the two systems.
 *
 * @param {string} unthreadTicketId - Unthread ticket ID
 * @param {string} discordThreadId - Discord thread ID
 * @returns {Promise<void>}
 */
export async function bindTicketWithThread(unthreadTicketId: string, discordThreadId: string): Promise<void> {
	// Create bidirectional mapping for efficient lookups
	await setKey(`ticket:discord:${discordThreadId}`, { unthreadTicketId, discordThreadId });
	await setKey(`ticket:unthread:${unthreadTicketId}`, { unthreadTicketId, discordThreadId });

	LogEngine.info(`Bound Discord thread ${discordThreadId} with Unthread ticket ${unthreadTicketId}`);
}

/**
 * Retrieves Unthread ticket mapping by Discord thread ID
 *
 * @param {string} discordThreadId - Discord thread ID
 * @returns {TicketMapping|null} - Ticket mapping or null if not found
 */
export async function getTicketByDiscordThreadId(discordThreadId: string): Promise<TicketMapping | null> {
	return (await getKey(`ticket:discord:${discordThreadId}`)) as TicketMapping | null;
}

/**
 * Retrieves Discord thread mapping by Unthread ticket ID
 *
 * @param {string} unthreadTicketId - Unthread ticket ID
 * @returns {TicketMapping|null} - Ticket mapping or null if not found
 */
export async function getTicketByUnthreadTicketId(unthreadTicketId: string): Promise<TicketMapping | null> {
	return (await getKey(`ticket:unthread:${unthreadTicketId}`)) as TicketMapping | null;
}

/**
 * ==================== WEBHOOK EVENT PROCESSING ====================
 * Handles incoming webhook events from Unthread and forwards them to Discord
 */

/**
 * Processes webhook events from Unthread
 *
 * @param {WebhookPayload} payload - Webhook payload from Unthread
 * @returns {Promise<void>}
 */
export async function handleWebhookEvent(payload: WebhookPayload): Promise<void> {
	const { event, data } = payload;

	LogEngine.info(`Processing webhook event: ${event}`);
	LogEngine.debug('Event data:', data);

	try {
		switch (event) {
		case 'conversation.message.created':
			await handleMessageCreated(data);
			break;
		case 'conversation.status.updated':
			await handleStatusUpdated(data);
			break;
		case 'conversation.created':
			LogEngine.debug('Conversation created event received - no action needed for Discord integration');
			break;
		default:
			LogEngine.debug(`Unhandled webhook event type: ${event}`);
		}
	}
	catch (error: any) {
		LogEngine.error(`Error processing webhook event ${event}:`, error);
		throw error;
	}
}

/**
 * Handles message creation webhook events
 *
 * @param {any} data - Webhook event data
 * @returns {Promise<void>}
 */
async function handleMessageCreated(data: any): Promise<void> {
	const conversationId = data.conversationId || data.id;
	const message = data.message;

	if (!conversationId || !message) {
		LogEngine.warn('Message created event missing required data');
		return;
	}

	try {
		const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
			conversationId,
			getTicketByUnthreadTicketId,
			{
				maxAttempts: 5,
				maxRetryWindow: 30000,
				baseDelayMs: 2000,
			},
		);

		if (!discordThread) {
			LogEngine.warn(`No Discord thread found for conversation ${conversationId}`);
			return;
		}

		// Process and clean the message content
		let messageContent = message.markdown || '';
		messageContent = decodeHtmlEntities(messageContent);
		messageContent = processQuotedContent(messageContent, []);

		// Skip duplicate messages
		if (await isDuplicateMessage(discordThread.id, messageContent)) {
			LogEngine.debug(`Skipping duplicate message in thread ${discordThread.id}`);
			return;
		}

		// Skip messages that contain Discord attachments
		if (containsDiscordAttachments(messageContent)) {
			LogEngine.debug(`Skipping message with Discord attachments in thread ${discordThread.id}`);
			return;
		}

		if (messageContent.trim()) {
			// Create embed for the message
			const embed = new EmbedBuilder()
				.setColor(0x00FF00)
				.setAuthor({
					name: message.authorName || 'Support Team',
					iconURL: 'https://cdn.unthread.io/assets/logo-32.png',
				})
				.setDescription(messageContent)
				.setFooter({ text: `Unthread Discord Bot v${version}` })
				.setTimestamp(new Date(message.createdAt));

			await discordThread.send({ embeds: [embed] });
			LogEngine.info(`Forwarded message from Unthread to Discord thread ${discordThread.id}`);
		}
	}
	catch (error: any) {
		if (error.message.includes('No Discord thread found')) {
			LogEngine.warn(`Thread mapping not found for conversation ${conversationId} - this is normal for conversations not created via Discord`);
		}
		else {
			LogEngine.error(`Error handling message created event for conversation ${conversationId}:`, error);
		}
	}
}

/**
 * Handles conversation status update webhook events
 *
 * @param {any} data - Webhook event data
 * @returns {Promise<void>}
 */
async function handleStatusUpdated(data: any): Promise<void> {
	const conversation = data.conversation;

	if (!conversation) {
		LogEngine.warn('Status updated event missing conversation data');
		return;
	}

	try {
		const { discordThread } = await findDiscordThreadByTicketId(
			conversation.id,
			getTicketByUnthreadTicketId,
		);

		if (!discordThread) {
			LogEngine.debug(`No Discord thread found for conversation ${conversation.id}`);
			return;
		}

		// Create status update embed
		const statusColor = conversation.status === 'closed' ? 0xFF0000 :
			conversation.status === 'resolved' ? 0x00FF00 : 0xFFFF00;

		const embed = new EmbedBuilder()
			.setColor(statusColor)
			.setTitle('Ticket Status Updated')
			.addFields(
				{ name: 'Ticket ID', value: `#${conversation.friendlyId}`, inline: true },
				{ name: 'Status', value: conversation.status.toUpperCase(), inline: true },
				{ name: 'Title', value: conversation.title || 'N/A', inline: false },
			)
			.setFooter({ text: `Unthread Discord Bot v${version}` })
			.setTimestamp();

		await discordThread.send({ embeds: [embed] });
		LogEngine.info(`Updated status for ticket ${conversation.friendlyId} in Discord thread ${discordThread.id}`);

		// Close Discord thread if ticket is closed/resolved
		if (conversation.status === 'closed' || conversation.status === 'resolved') {
			try {
				await discordThread.setArchived(true);
				LogEngine.info(`Archived Discord thread ${discordThread.id} for ${conversation.status} ticket`);
			}
			catch (error: any) {
				LogEngine.warn(`Failed to archive Discord thread ${discordThread.id}:`, error.message);
			}
		}
	}
	catch (error: any) {
		if (error.message.includes('No Discord thread found')) {
			LogEngine.debug(`Thread mapping not found for conversation ${conversation.id} - this is normal for conversations not created via Discord`);
		}
		else {
			LogEngine.error(`Error handling status update for conversation ${conversation.id}:`, error);
		}
	}
}

/**
 * ==================== MESSAGE FORWARDING ====================
 * Handles forwarding messages from Discord to Unthread
 */

/**
 * Sends a message from Discord to an Unthread conversation
 *
 * @param {string} conversationId - Unthread conversation ID
 * @param {User} user - Discord user who sent the message
 * @param {string} message - Message content
 * @param {string} email - User's email address
 * @returns {Promise<any>} - Unthread API response
 */
export async function sendMessageToUnthread(
	conversationId: string,
	user: User,
	message: string,
	email: string,
): Promise<any> {
	const requestData = {
		markdown: message,
		onBehalfOf: {
			name: user.tag,
			email: email,
		},
	};

	LogEngine.debug(`Sending message to Unthread conversation ${conversationId}:`, requestData);

	const response = await fetch(`https://api.unthread.io/api/conversations/${conversationId}/messages`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-KEY': process.env.UNTHREAD_API_KEY as string,
		},
		body: JSON.stringify(requestData),
	});

	if (!response.ok) {
		const errorText = await response.text();
		LogEngine.error(`Failed to send message to Unthread: ${response.status} - ${errorText}`);
		throw new Error(`Failed to send message to Unthread: ${response.status}`);
	}

	const responseData = await response.json();
	LogEngine.debug('Message sent to Unthread successfully:', responseData);
	return responseData;
}