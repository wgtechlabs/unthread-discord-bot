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
import { isDuplicateMessage, containsDiscordAttachments } from '../utils/messageUtils';
import { findDiscordThreadByTicketId, findDiscordThreadByTicketIdWithRetry } from '../utils/threadUtils';
import { getOrCreateCustomer, getCustomerByDiscordId, Customer } from '../utils/customerUtils';
import { version } from '../../package.json';
import { UnthreadApiResponse, UnthreadTicket, WebhookPayload } from '../types/unthread';
import { ThreadTicketMapping } from '../types/discord';

/**
 * ==================== ENVIRONMENT VALIDATION ====================
 * Preflight checks to ensure required environment variables are present
 */

// Validate critical environment variables at module initialization
function validateEnvironment(): void {
	const requiredEnvVars = [
		{ name: 'UNTHREAD_API_KEY', value: process.env.UNTHREAD_API_KEY },
		{ name: 'UNTHREAD_SLACK_CHANNEL_ID', value: process.env.UNTHREAD_SLACK_CHANNEL_ID },
	];

	const missingVars = requiredEnvVars.filter(envVar => !envVar.value?.trim());

	if (missingVars.length > 0) {
		const missingNames = missingVars.map(v => v.name).join(', ');
		LogEngine.error(`Missing required environment variables: ${missingNames}`);
		LogEngine.error('Please ensure all required environment variables are set before starting the application.');
		throw new Error(`Missing required environment variables: ${missingNames}`);
	}

	LogEngine.info('Environment validation passed - all required variables are set');
}

// Perform validation immediately when module is loaded
validateEnvironment();

/**
 * ==================== CUSTOMER MANAGEMENT FUNCTIONS ====================
 * These functions handle creating and retrieving customer records in Unthread
 */

/**
 * Legacy wrapper for customer creation
 *
 * @deprecated Use getOrCreateCustomer from customerUtils directly
 */
export async function saveCustomer(user: User, email: string): Promise<Customer> {
	return await getOrCreateCustomer(user, email);
}

/**
 * Legacy wrapper for customer retrieval
 *
 * @deprecated Use getCustomerByDiscordId from customerUtils directly
 */
export async function getCustomerById(discordId: string): Promise<Customer | null> {
	return await getCustomerByDiscordId(discordId);
}

/**
 * ==================== TICKET MANAGEMENT FUNCTIONS ====================
 * These functions handle ticket creation and mapping between Discord threads and Unthread tickets
 */

/**
 * Creates a new support ticket in Unthread
 *
 * @param user - Discord user object
 * @param title - Ticket title
 * @param issue - Ticket description/content
 * @param email - User's email address
 * @returns Unthread API response with ticket details
 * @throws {Error} When UNTHREAD_API_KEY environment variable is not set
 * @throws {Error} When customer creation fails
 * @throws {Error} When API request fails (4xx/5xx responses)
 * @throws {Error} When ticket response is missing required fields (id, friendlyId)
 */
export async function createTicket(user: User, title: string, issue: string, email: string): Promise<UnthreadTicket> {
	// Enhanced debugging: Initial request context
	LogEngine.info(`Creating ticket for user: ${user.displayName || user.username} (${user.id})`);
	LogEngine.debug(`Env: API_KEY=${process.env.UNTHREAD_API_KEY ? 'SET' : 'NOT_SET'}, SLACK_CHANNEL_ID=${process.env.UNTHREAD_SLACK_CHANNEL_ID ? 'SET' : 'NOT_SET'}`);

	// Validate API key before making request
	const apiKey = process.env.UNTHREAD_API_KEY;
	if (!apiKey) {
		LogEngine.error('UNTHREAD_API_KEY environment variable is not set');
		throw new Error('UNTHREAD_API_KEY environment variable is required');
	}

	const customer = await getOrCreateCustomer(user, email);
	LogEngine.debug(`Customer: ${customer?.customerId || 'unknown'} (${customer?.email || email})`);

	const requestPayload = {
		type: 'slack',
		title: title,
		markdown: `${issue}`,
		status: 'open',
		channelId: process.env.UNTHREAD_SLACK_CHANNEL_ID?.trim(),
		customerId: customer?.customerId,
		onBehalfOf: {
			name: user.displayName || user.username,
			email: email,
		},
	};

	LogEngine.info('POST https://api.unthread.io/api/conversations');
	LogEngine.debug(`Payload: ${JSON.stringify(requestPayload)}`);

	const response = await fetch('https://api.unthread.io/api/conversations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-KEY': apiKey,
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

	LogEngine.info(`Created ticket ${data.friendlyId} (${data.id}) for user ${user.displayName || user.username}`);
	return data as UnthreadTicket;
}

/**
 * Binds a Discord thread to an Unthread ticket
 *
 * Creates a bidirectional mapping in the cache to enable message forwarding
 * and webhook event routing between the two systems.
 *
 * @param unthreadTicketId - Unthread ticket ID
 * @param discordThreadId - Discord thread ID
 * @throws {Error} When cache operations fail
 */
export async function bindTicketWithThread(unthreadTicketId: string, discordThreadId: string): Promise<void> {
	const mapping: ThreadTicketMapping = {
		unthreadTicketId,
		discordThreadId,
		createdAt: new Date().toISOString(),
	};

	// Create bidirectional mapping for efficient lookups
	await setKey(`ticket:discord:${discordThreadId}`, mapping);
	await setKey(`ticket:unthread:${unthreadTicketId}`, mapping);

	LogEngine.info(`Bound Discord thread ${discordThreadId} with Unthread ticket ${unthreadTicketId}`);
}

/**
 * Retrieves Unthread ticket mapping by Discord thread ID
 *
 * @param discordThreadId - Discord thread ID
 * @returns Ticket mapping or null if not found
 */
export async function getTicketByDiscordThreadId(discordThreadId: string): Promise<ThreadTicketMapping | null> {
	return (await getKey(`ticket:discord:${discordThreadId}`)) as ThreadTicketMapping | null;
}

/**
 * Retrieves Discord thread mapping by Unthread ticket ID
 *
 * @param unthreadTicketId - Unthread ticket ID
 * @returns Ticket mapping or null if not found
 */
export async function getTicketByUnthreadTicketId(unthreadTicketId: string): Promise<ThreadTicketMapping | null> {
	return (await getKey(`ticket:unthread:${unthreadTicketId}`)) as ThreadTicketMapping | null;
}

/**
 * ==================== WEBHOOK EVENT PROCESSING ====================
 * Handles incoming webhook events from Unthread and forwards them to Discord
 */

/**
 * Processes webhook events from Unthread
 *
 * Handles various webhook event types including message creation and conversation updates.
 * Routes events to appropriate handlers based on event type.
 *
 * @param payload - Webhook payload from Unthread
 * @throws {Error} When event processing fails for supported event types
 * @throws {Error} When message forwarding or status updates fail
 *
 * @example
 * ```typescript
 * await handleWebhookEvent({
 *   event: 'message_created',
 *   data: { conversationId: '123', text: 'Hello', userId: 'user123' }
 * });
 * ```
 */
export async function handleWebhookEvent(payload: WebhookPayload): Promise<void> {
	const { event, data } = payload;

	LogEngine.info(`Processing webhook event: ${event}`);
	LogEngine.debug('Event data:', data);

	try {
		switch (event) {
		case 'message_created':
			await handleMessageCreated(data);
			break;
		case 'conversation_updated':
			await handleStatusUpdated(data);
			break;
		case 'conversation.created':
			LogEngine.debug('Conversation created event received - no action needed for Discord integration');
			break;
		default:
			LogEngine.debug(`Unhandled webhook event type: ${event}`);
		}
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		LogEngine.error(`Error processing webhook event ${event}:`, errorMessage);
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
	// Check if message originated from Discord to avoid duplication
	if (data.metadata && data.metadata.source === 'discord') {
		LogEngine.debug('Message originated from Discord, skipping to avoid duplication');
		return;
	}

	/**
	 * Critical: Check if message has a userId.
	 *
	 * In Unthread, webhook events for message creation may originate from either human users or automated sources (such as bots or system integrations).
	 * Messages that lack a `userId` are typically generated by bots, system processes, or automated workflows (e.g., status updates, internal notifications).
	 *
	 * If these bot/system messages were processed as if they were user messages, they could trigger the creation of duplicate tickets or duplicate message forwarding,
	 * since the Discord bot may have already handled the original user action that led to the bot/system message.
	 *
	 * By skipping messages without a `userId`, we ensure that only genuine user-generated messages are processed for ticket creation and message forwarding,
	 * preventing duplicate tickets and unnecessary message loops between Discord and Unthread.
	 */
	if (!data.userId) {
		LogEngine.debug(`Message has no userId (likely from bot/system), skipping to prevent duplication loops. ConversationId: ${data.conversationId || data.id}`);
		return;
	}

	const conversationId = data.conversationId || data.id;
	const messageText = data.text;

	if (!conversationId || !messageText) {
		LogEngine.warn('Message created event missing required data');
		return;
	}

	// Extract timestamp from Slack-formatted message ID for duplicate detection
	const messageId = data.id;
	const slackTimestamp = messageId ? messageId.split('-').pop()?.split('.')[0] : null;

	if (slackTimestamp) {
		// Check if we have any records of a message deleted within a short window
		const currentTime = Date.now();
		// Convert to milliseconds
		const messageTimestamp = parseInt(slackTimestamp) * 1000;

		// Only process if the message isn't too old (prevents processing old messages)
		// Within 10 seconds
		if (currentTime - messageTimestamp < 10000) {
			// Check recent deleted messages in this channel
			const ticketMapping = await getTicketByUnthreadTicketId(conversationId);

			// If we can't find the thread mapping, proceed with sending the message
			if (!ticketMapping) {
				LogEngine.debug(`No Discord thread found for Unthread ticket ${conversationId}, proceeding with message`);
			}
			else {
				const deletedMessagesKey = `deleted:channel:${ticketMapping.discordThreadId}`;
				const recentlyDeletedMessages = (await getKey(deletedMessagesKey)) as any[] || [];

				// If there are any recently deleted messages in the last 5 seconds,
				// skip processing to avoid duplicates
				if (recentlyDeletedMessages.length > 0) {
					LogEngine.debug(`Recently deleted messages found for thread ${ticketMapping.discordThreadId}, skipping to avoid duplicates`);
					return;
				}
			}
		}
	}

	try {
		// Use retry-enabled lookup for message_created events to handle race conditions
		const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
			conversationId,
			getTicketByUnthreadTicketId,
			{
				maxAttempts: 3,
				// 10 seconds - reasonable for new ticket creation
				maxRetryWindow: 10000,
				// 1 second base delay
				baseDelayMs: 1000,
			},
		);

		if (!discordThread) {
			LogEngine.warn(`No Discord thread found for conversation ${conversationId}`);
			return;
		}

		// Process and clean the message content
		const messageContent = decodeHtmlEntities(messageText);

		// Fetch recent messages to check for duplicates
		const messages = await discordThread.messages.fetch({ limit: 10 });
		const messagesArray = Array.from(messages.values());

		// Check if thread has at least 2 messages (initial message + ticket summary)
		if (messages.size >= 2) {
			// Check for duplicate messages using our utility function
			if (isDuplicateMessage(messagesArray as any, messageContent)) {
				LogEngine.debug('Duplicate message detected. Skipping send.');
				return;
			}

			// Check ticket summary for duplicate content
			const sortedMessages = messagesArray.sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);

			// New check: Is this a forum post with its original content being echoed back?
			// This specifically handles the case of forum posts having their content duplicated
			const firstMessage = sortedMessages[0];
			if (firstMessage && (firstMessage as any).content.trim() === messageContent.trim()) {
				LogEngine.debug('Message appears to be echoing the initial forum post. Skipping to prevent duplication.');
				return;
			}
		}

		// Skip messages that contain Discord attachments
		if (containsDiscordAttachments(messageContent)) {
			LogEngine.debug(`Skipping message with Discord attachments in thread ${discordThread.id}`);
			return;
		}

		if (messageContent.trim()) {
			// Send as a regular Discord bot message instead of embed
			await discordThread.send(messageContent);
			LogEngine.info(`Forwarded message from Unthread to Discord thread ${discordThread.id}`);
		}
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		if (errorMessage.includes('No Discord thread found')) {
			LogEngine.warn(`Thread mapping not found for conversation ${conversationId} - this is normal for conversations not created via Discord`);
		}
		else {
			LogEngine.error(`Error handling message created event for conversation ${conversationId}:`, errorMessage);
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
	// The conversation data is directly in the data object, not nested under 'conversation'
	const conversation = data.conversation || data;

	if (!conversation || !conversation.id) {
		LogEngine.warn('Status updated event missing conversation data');
		return;
	}

	LogEngine.debug(`Processing status update for conversation ${conversation.id} (ticket #${conversation.friendlyId}): ${conversation.status}`);

	try {
		const { discordThread } = await findDiscordThreadByTicketId(
			conversation.id,
			getTicketByUnthreadTicketId,
		);

		if (!discordThread) {
			LogEngine.debug(`No Discord thread found for conversation ${conversation.id}`);
			return;
		}

		// Create status update embed with Material Design colors and better formatting
		const getStatusInfo = (status: string) => {
			switch (status.toLowerCase()) {
			case 'open':
				// Material Red
				return { color: 0xF44336, displayName: 'Open' };
			case 'in_progress':
				// Material Yellow
				return { color: 0xFFEB3B, displayName: 'In Progress' };
			case 'on_hold':
				// Material Orange
				return { color: 0xFF9800, displayName: 'Waiting' };
			case 'closed':
			case 'resolved':
				// Material Green
				return { color: 0x4CAF50, displayName: 'Resolved' };
			default:
				// Material Grey for unknown statuses
				return { color: 0x9E9E9E, displayName: status.charAt(0).toUpperCase() + status.slice(1) };
			}
		};

		const statusInfo = getStatusInfo(conversation.status);

		const embed = new EmbedBuilder()
			.setColor(statusInfo.color)
			.setTitle('Ticket Status Updated')
			.addFields(
				{ name: 'Ticket ID', value: `#${conversation.friendlyId}`, inline: true },
				{ name: 'Status', value: statusInfo.displayName, inline: true },
			)
			.setFooter({
				text: (() => {
					const client = (global as typeof globalThis).discordClient;
					if (client?.user?.displayName) {
						return `${client.user.displayName} v${version}`;
					}
					else if (client?.user?.username) {
						return `${client.user.username} v${version}`;
					}
					else {
						// Fallback when Discord client is unavailable (e.g., during startup, network issues)
						LogEngine.debug('Discord client unavailable for footer text, using fallback');
						return `Unthread Discord Bot v${version}`;
					}
				})(),
			})
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
 * Forwards Discord messages to Unthread with proper metadata tagging
 * to prevent message loops. Includes timeout handling and preflight checks.
 *
 * @param conversationId - Unthread conversation ID
 * @param user - Discord user who sent the message
 * @param message - Message content
 * @param email - User's email address
 * @returns Unthread API response
 * @throws {Error} When UNTHREAD_API_KEY is not set
 * @throws {Error} When conversation doesn't exist (preflight check fails)
 * @throws {Error} When API request fails or times out (8 second timeout)
 * @throws {Error} When message sending fails (4xx/5xx responses)
 *
 * @example
 * ```typescript
 * const response = await sendMessageToUnthread(
 *   'conv123',
 *   discordUser,
 *   'Hello from Discord',
 *   'user@example.com'
 * );
 * ```
 */
export async function sendMessageToUnthread(
	conversationId: string,
	user: User,
	message: string,
	email: string,
): Promise<UnthreadApiResponse<any>> {
	const requestData = {
		markdown: message,
		onBehalfOf: {
			name: user.displayName || user.username,
			email: email,
		},
		metadata: {
			source: 'discord',
		},
	};

	LogEngine.debug(`Sending message to Unthread conversation ${conversationId}:`, requestData);

	const conversationUrl = `https://api.unthread.io/api/conversations/${conversationId}`;
	const abortController = new AbortController();
	// 8 second timeout for request operations
	const timeoutId = setTimeout(() => abortController.abort(), 8000);

	try {
		// Validate API key before making requests
		const apiKey = process.env.UNTHREAD_API_KEY;
		if (!apiKey) {
			LogEngine.error('UNTHREAD_API_KEY environment variable is not set');
			throw new Error('UNTHREAD_API_KEY environment variable is required');
		}

		// Perform preflight check to verify conversation exists
		LogEngine.debug(`Performing preflight check for conversation ${conversationId}`);
		const preflightResponse = await fetch(conversationUrl, {
			method: 'HEAD',
			headers: {
				'X-API-KEY': apiKey,
			},
			signal: abortController.signal,
		});

		if (!preflightResponse.ok) {
			throw new Error(`Conversation preflight check failed: ${preflightResponse.status} - Conversation may not exist or be accessible`);
		}

		LogEngine.debug(`Preflight check passed for conversation ${conversationId}`);

		// Send the actual message
		const response = await fetch(`${conversationUrl}/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-KEY': apiKey,
			},
			body: JSON.stringify(requestData),
			signal: abortController.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			LogEngine.error(`Failed to send message to Unthread: ${response.status} - ${errorText}`);
			throw new Error(`Failed to send message to Unthread: ${response.status}`);
		}

		const responseData = await response.json();
		LogEngine.debug('Message sent to Unthread successfully:', responseData);
		return {
			success: true,
			data: responseData,
		};
	}
	catch (error: any) {
		if (error.name === 'AbortError') {
			LogEngine.error(`Request to Unthread conversation ${conversationId} timed out after 8 seconds`);
			throw new Error('Request to Unthread timed out');
		}
		throw error;
	}
	finally {
		clearTimeout(timeoutId);
	}
}