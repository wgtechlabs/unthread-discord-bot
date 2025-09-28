/**
 * Unthread Service - Core API Integration
 *
 * @description
 * Primary integration layer handling all communication with the Unthread API.
 * Manages customer records, ticket lifecycle, webhook processing, and real-time
 * synchronization between Discord and Unthread ticketing system.
 *
 * @module services/unthread
 * @since 1.0.0
 *
 * @keyFunctions
 * - validateEnvironment(): Validates required environment variables at startup
 * - getOrCreateTicket(): Creates tickets from Discord interactions with customer mapping
 * - processWebhookEvent(): Handles real-time webhook events from Unthread
 * - forwardMessageToUnthread(): Syncs Discord messages to Unthread tickets
 * - updateTicketStatus(): Updates ticket status based on Discord thread state
 *
 * @commonIssues
 * - Authentication failures: Invalid or expired UNTHREAD_API_KEY
 * - Rate limiting: HTTP 429 responses from excessive API calls
 * - Data consistency: Thread-ticket mappings become out of sync
 * - Webhook validation: Invalid signatures or malformed payloads
 * - Customer duplication: Multiple records for same Discord user
 *
 * @troubleshooting
 * - Verify UNTHREAD_API_KEY in environment variables and check permissions
 * - Monitor API response codes: 401 (auth), 429 (rate limit), 500 (server error)
 * - Check network connectivity to api.unthread.io endpoint
 * - Validate webhook signatures and payload structure
 * - Review BotsStore for thread-ticket mapping consistency
 * - Check Discord permissions for bot in target channels
 *
 * @performance
 * - API calls use automatic retry logic with exponential backoff
 * - Webhook events processed asynchronously to prevent blocking
 * - Customer lookups cached in BotsStore for performance
 * - Rate limiting respected with intelligent request spacing
 *
 * @dependencies Express.js, Discord.js, BotsStore, LogEngine, node-fetch
 *
 * @example Basic Usage
 * ```typescript
 * // Create ticket from Discord interaction
 * const ticket = await getOrCreateTicket(interaction.user, 'Support needed');
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Process webhook event with error handling
 * try {
 *   await processWebhookEvent(webhookPayload, discordClient);
 * } catch (error) {
 *   LogEngine.error('Webhook processing failed', error);
 * }
 * ```
 */

import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';
import { BotsStore, ExtendedThreadTicketMapping } from '../sdk/bots-brain/BotsStore';
import { getBotFooter } from '../utils/botUtils';
import { EmbedBuilder, User } from 'discord.js';
import { LogEngine } from '../config/logger';
import { isDuplicateMessage } from '../utils/messageUtils';
import { findDiscordThreadByTicketId, findDiscordThreadByTicketIdWithRetry } from '../utils/threadUtils';
import { getOrCreateCustomer, getCustomerByDiscordId, Customer } from '../utils/customerUtils';
import { WebhookPayload, UnthreadApiResponse, UnthreadTicket } from '../types/unthread';
import { FileBuffer } from '../types/attachments';
import { getConfig, DEFAULT_CONFIG } from '../config/defaults';

/**
 * ==================== ENVIRONMENT VALIDATION ====================
 * Preflight checks to ensure required environment variables are present
 */

/**
 * Validates critical environment variables required for Unthread service operations
 *
 * @function validateEnvironment
 * @throws {Error} When UNTHREAD_API_KEY, UNTHREAD_SLACK_CHANNEL_ID, or UNTHREAD_WEBHOOK_SECRET are missing
 *
 * @example
 * ```typescript
 * import { validateEnvironment } from './services/unthread';
 *
 * // Call during application initialization
 * validateEnvironment();
 * ```
 *
 * @troubleshooting
 * - Check .env file exists and contains required variables
 * - Verify environment variables are properly loaded with dotenv
 * - Ensure no trailing whitespace in environment variable values
 */
export function validateEnvironment(): void {
	const requiredEnvVars = [
		{ name: 'UNTHREAD_API_KEY', value: process.env.UNTHREAD_API_KEY },
		{ name: 'UNTHREAD_SLACK_CHANNEL_ID', value: process.env.UNTHREAD_SLACK_CHANNEL_ID },
		{ name: 'UNTHREAD_WEBHOOK_SECRET', value: process.env.UNTHREAD_WEBHOOK_SECRET },
	];

	const missingVars = requiredEnvVars.filter(envVar => !envVar.value?.trim());

	if (missingVars.length > 0) {
		const missingNames = missingVars.map(v => v.name).join(', ');
		LogEngine.error(`Missing required environment variables: ${missingNames}`);
		LogEngine.error('Please ensure all required environment variables are set before starting the application.');
		throw new Error(`Missing required environment variables: ${missingNames}`);
	}

	// Log optional variables status for debugging
	const slackTeamId = process.env.SLACK_TEAM_ID;
	if (slackTeamId?.trim()) {
		LogEngine.info('Optional SLACK_TEAM_ID is configured - file attachments enabled');
	}
	else {
		LogEngine.info('Optional SLACK_TEAM_ID not configured - file attachments will be limited');
	}

	LogEngine.info('Unthread environment validation passed - all required variables are set');
}

/**
 * ==================== CUSTOMER MANAGEMENT FUNCTIONS ====================
 * These functions handle creating and retrieving customer records in Unthread
 */

/**
 * Legacy wrapper for customer creation - use customerUtils directly instead
 *
 * @deprecated Use getOrCreateCustomer from customerUtils directly
 * @function saveCustomer
 * @param {User} user - Discord user object containing user details
 * @param {string} email - User's email address for ticket correspondence
 * @returns {Promise<Customer>} Customer record with Unthread integration
 */
export async function saveCustomer(user: User, email: string): Promise<Customer> {
	return await getOrCreateCustomer(user, email);
}

/**
 * Legacy wrapper for customer retrieval - use customerUtils directly instead
 *
 * @deprecated Use getCustomerByDiscordId from customerUtils directly
 * @function getCustomerById
 * @param {string} discordId - Discord user ID to lookup
 * @returns {Promise<Customer | null>} Customer record or null if not found
 */
export async function getCustomerById(discordId: string): Promise<Customer | null> {
	return await getCustomerByDiscordId(discordId);
}

/**
 * ==================== TICKET MANAGEMENT FUNCTIONS ====================
 * These functions handle ticket creation and mapping between Discord threads and Unthread tickets
 */

/**
 * Creates a new support ticket in Unthread ticketing system
 *
 * @async
 * @function createTicket
 * @param {User} user - Discord user object containing user details and ID
 * @param {string} title - Ticket title for support issue
 * @param {string} issue - Detailed ticket description/content in markdown format
 * @param {string} email - User's email address for ticket correspondence
 * @returns {Promise<UnthreadTicket>} Unthread API response with ticket details including ID and friendlyId
 * @throws {Error} When UNTHREAD_API_KEY environment variable is not set
 * @throws {Error} When customer creation fails in Unthread system
 * @throws {Error} When API request fails (4xx/5xx responses)
 * @throws {Error} When ticket response is missing required fields (id, friendlyId)
 *
 * @example
 * ```typescript
 * const ticket = await createTicket(
 *   discordUser,
 *   'Login Issue',
 *   'Unable to access dashboard',
 *   'user@example.com'
 * );
 * ```
 *
 * @troubleshooting
 * - Verify UNTHREAD_API_KEY has ticket creation permissions
 * - Check UNTHREAD_SLACK_CHANNEL_ID exists and bot has access
 * - Monitor API timeout (default 30s) for large requests
 * - Validate customer creation doesn't fail due to duplicate emails
 */
export async function createTicket(user: User, title: string, issue: string, email: string): Promise<UnthreadTicket> {
	// Enhanced debugging: Initial request context
	LogEngine.info(`Creating ticket for user: ${user.displayName || user.username} (${user.id})`);
	LogEngine.debug(`Env: API_KEY=${process.env.UNTHREAD_API_KEY ? 'SET' : 'NOT_SET'}, SLACK_CHANNEL_ID=${process.env.UNTHREAD_SLACK_CHANNEL_ID ? 'SET' : 'NOT_SET'}`);

	// Get API key (guaranteed to exist due to startup validation)
	const apiKey = process.env.UNTHREAD_API_KEY;
	if (!apiKey) {
		throw new Error('UNTHREAD_API_KEY environment variable is required');
	}

	const customer = await getOrCreateCustomer(user, email);
	LogEngine.debug(`Customer: ${customer?.unthreadCustomerId || 'unknown'} (${customer?.email || email})`);

	const requestPayload = {
		type: 'slack',
		title: title,
		markdown: `${issue}`,
		status: 'open',
		channelId: process.env.UNTHREAD_SLACK_CHANNEL_ID?.trim(),
		customerId: customer?.unthreadCustomerId,
		onBehalfOf: {
			name: user.displayName || user.username,
			email: email,
		},
	};

	LogEngine.info('POST https://api.unthread.io/api/conversations');
	LogEngine.debug(`Payload: ${JSON.stringify(requestPayload)}`);

	// Setup timeout handling for request resilience
	const abortController = new AbortController();
	const timeoutMs = getConfig('UNTHREAD_HTTP_TIMEOUT_MS', DEFAULT_CONFIG.UNTHREAD_HTTP_TIMEOUT_MS);
	const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const response = await fetch('https://api.unthread.io/api/conversations', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-KEY': apiKey,
			},
			body: JSON.stringify(requestPayload),
			signal: abortController.signal,
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
	catch (error: unknown) {
		if (error instanceof Error && error.name === 'AbortError') {
			LogEngine.error(`Request to create ticket timed out after ${timeoutMs}ms`);
			throw new Error('Request to create ticket timed out');
		}
		throw error;
	}
	finally {
		clearTimeout(timeoutId);
	}
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
/**
 * Binds a Discord thread with an Unthread ticket using BotsStore
 *
 * @param unthreadTicketId - Unthread ticket ID
 * @param discordThreadId - Discord thread ID
 * @throws {Error} When storage operations fail
 */
export async function bindTicketWithThread(unthreadTicketId: string, discordThreadId: string): Promise<void> {
	try {
		const botsStore = BotsStore.getInstance();

		const mapping: ExtendedThreadTicketMapping = {
			unthreadTicketId,
			discordThreadId,
			createdAt: new Date().toISOString(),
			status: 'active',
		};

		// Store using BotsStore 3-layer architecture
		await botsStore.storeThreadTicketMapping(mapping);

		LogEngine.info(`Bound Discord thread ${discordThreadId} with Unthread ticket ${unthreadTicketId} using 3-layer storage`);
	}
	catch (error) {
		LogEngine.error('Error binding ticket with thread:', error);
		throw error;
	}
}

/**
 * Retrieves Unthread ticket mapping by Discord thread ID
 *
 * Uses hybrid storage strategy: checks memory cache first (fast),
 * then falls back to persistent storage (3-year retention)
 *
 * @param discordThreadId - Discord thread ID
 * @returns Ticket mapping or null if not found
 */
/**
 * Retrieves the Unthread ticket mapping for a Discord thread using BotsStore
 *
 * @param discordThreadId - Discord thread ID
 * @returns Ticket mapping or null if not found
 */
export async function getTicketByDiscordThreadId(discordThreadId: string): Promise<ExtendedThreadTicketMapping | null> {
	try {
		const botsStore = BotsStore.getInstance();
		const mapping = await botsStore.getThreadTicketMapping(discordThreadId);

		if (mapping) {
			LogEngine.debug(`Found ticket mapping for Discord thread: ${discordThreadId}`);
		}
		else {
			LogEngine.debug(`No ticket mapping found for Discord thread: ${discordThreadId}`);
		}

		return mapping;
	}
	catch (error) {
		LogEngine.error('Error retrieving ticket mapping by Discord thread ID:', error);
		return null;
	}
}

/**
 * Retrieves Discord thread mapping by Unthread ticket ID
 *
 * Uses hybrid storage strategy: checks memory cache first (fast),
 * then falls back to persistent storage (3-year retention)
 *
 * @param unthreadTicketId - Unthread ticket ID
 * @returns Ticket mapping or null if not found
 */
/**
 * Retrieves the Discord thread mapping for an Unthread ticket using BotsStore
 *
 * @param unthreadTicketId - Unthread ticket ID
 * @returns Ticket mapping or null if not found
 */
export async function getTicketByUnthreadTicketId(unthreadTicketId: string): Promise<ExtendedThreadTicketMapping | null> {
	try {
		const botsStore = BotsStore.getInstance();
		const mapping = await botsStore.getMappingByTicketId(unthreadTicketId);

		if (mapping) {
			LogEngine.debug(`Found ticket mapping for Unthread ticket: ${unthreadTicketId}`);
		}
		else {
			LogEngine.debug(`No ticket mapping found for Unthread ticket: ${unthreadTicketId}`);
		}

		return mapping;
	}
	catch (error) {
		LogEngine.error('Error retrieving ticket mapping:', error);
		return null;
	}
}

/**
 * ==================== WEBHOOK EVENT PROCESSING ====================
 * Handles incoming webhook events from Unthread and forwards them to Discord
 */

/**
 * Process incoming webhook events from Unthread
 *
 * Handles different types of webhook events and routes them to appropriate handlers.
 * This function processes events from the Redis queue that were received from Unthread webhooks.
 *
 * @param {WebhookPayload} payload - The webhook event payload
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await handleWebhookEvent({
 *   type: 'message_created',
 *   data: { conversationId: '123', text: 'Hello', userId: 'user123' }
 * });
 * ```
 */
export async function handleWebhookEvent(payload: WebhookPayload): Promise<void> {
	const { type, data, sourcePlatform } = payload;

	LogEngine.info(`Processing webhook event: ${type}`);
	LogEngine.debug('Event data:', data);

	try {
		switch (type) {
		case 'message_created':
			await handleMessageCreated(data, sourcePlatform);
			break;
		case 'conversation_updated':
			await handleStatusUpdated(data);
			break;
		case 'conversation_created':
			LogEngine.debug('Conversation created event received - no action needed for Discord integration');
			break;
		default:
			LogEngine.debug(`Unhandled webhook event type: ${type}`);
		}
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		LogEngine.error(`Error processing webhook event ${type}:`, errorMessage);
		throw error;
	}
}

/**
 * Handles message creation webhook events
 *
 * @param {any} data - Webhook event data
 * @param {string} sourcePlatform - Source platform from webhook server (dashboard, discord, etc.)
 * @returns {Promise<void>}
 */
async function handleMessageCreated(data: any, sourcePlatform: string): Promise<void> {
	// Check if message originated from Discord to avoid duplication
	// The webhook server provides sourcePlatform for reliable source detection
	if (sourcePlatform === 'discord') {
		LogEngine.debug('Message originated from Discord, skipping to avoid duplication', {
			sourcePlatform,
			conversationId: data.conversationId || data.id,
		});
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
	const messageText = data.text || data.content;

	// Use pre-transformed data directly from webhook server
	const hasFiles = data.files && data.files.length > 0;
	const fileCount = data.files ? data.files.length : 0;

	LogEngine.info('📋 Processing pre-transformed message data', {
		conversationId,
		hasFiles,
		fileCount,
		hasText: !!messageText?.trim(),
		sourcePlatform,
	});

	if (!conversationId || (!messageText?.trim() && !hasFiles)) {
		LogEngine.warn('Message created event missing required data (must have text or files)');
		return;
	}

	// Detect file attachment notification patterns - process files only, skip text
	const isFileAttachedNotification = messageText && hasFiles && (
		messageText.trim().toLowerCase() === 'file attached' ||
		/^\d+\s+files?\s+attached$/i.test(messageText.trim())
	);

	if (isFileAttachedNotification) {
		LogEngine.info('📎 Processing file-only message (skipping file attachment notification text)', {
			conversationId,
			fileCount,
			fileOnlyMode: true,
			notificationText: messageText.trim(),
		});

		// Process files directly from pre-transformed data
		if (data.files && data.files.length > 0) {
			try {
				const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
					conversationId,
					{ maxAttempts: 3, maxRetryWindow: 10000, baseDelayMs: 1000 },
				);

				if (discordThread) {
					LogEngine.info(`Processing ${data.files.length} files from pre-transformed data:`,
						data.files.map((f: any) => ({ id: f.id, name: f.name, type: f.mimetype, size: f.size })));

					// Use pre-transformed file data directly - no conversion needed
					const { AttachmentHandler } = await import('../utils/attachmentHandler');
					const attachmentHandler = new AttachmentHandler();

					const attachmentResult = await attachmentHandler.downloadUnthreadFilesToDiscord(
						discordThread,
						data.files,
						// No text message for file-only notifications
						undefined,
					);

					if (attachmentResult.success) {
						LogEngine.info(`Successfully processed ${attachmentResult.processedCount} file-only attachments`);
					}
					else {
						LogEngine.warn(`File-only processing failed: ${attachmentResult.errors.join(', ')}`);
					}
				}
				else {
					LogEngine.warn(`No Discord thread found for file-only message in conversation ${conversationId}`);
				}
			}
			catch (error) {
				LogEngine.error('Error processing file-only attachments:', error);
			}
		}
		else {
			LogEngine.warn('File attachment notification detected but no files found in pre-transformed data', {
				conversationId,
				hasFiles: !!data.files,
				filesLength: data.files?.length || 0,
				notificationText: messageText.trim(),
			});
		}
		// Early return - do not process notification text for file attachment notifications
		return;
	}

	// Process regular messages with pre-transformed data
	try {
		// Use retry-enabled lookup for message_created events to handle race conditions
		const retryOptions = {
			maxAttempts: 3,
			maxRetryWindow: 10000,
			baseDelayMs: 1000,
		};

		const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
			conversationId,
			retryOptions,
		);

		if (!discordThread) {
			LogEngine.warn(`No Discord thread found for conversation ${conversationId}`);
			return;
		}

		// Check for oversized files (simple size check)
		// 8MB Discord limit
		const maxSizeBytes = 8 * 1024 * 1024;
		if (hasFiles && data.files) {
			const totalSize = data.files.reduce((sum: number, file: any) => sum + (file.size || 0), 0);
			if (totalSize > maxSizeBytes) {
				await handleOversizedFiles(discordThread, totalSize, maxSizeBytes);
				return;
			}
		}

		// Process and clean the message content
		const messageContent = messageText ? decodeHtmlEntities(messageText) : '';

		// Check for duplicate messages
		if (messageContent.trim()) {
			const messages = await discordThread.messages.fetch({ limit: 10 });
			const messagesArray = Array.from(messages.values());

			if (messages.size >= 2) {
				if (isDuplicateMessage(messagesArray as any, messageContent)) {
					LogEngine.debug('Duplicate message detected. Skipping send.');
					return;
				}

				// Check if echoing the initial forum post
				const sortedMessages = messagesArray.sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);
				const firstMessage = sortedMessages[0];
				if (firstMessage && (firstMessage as any).content.trim() === messageContent.trim()) {
					LogEngine.debug('Message appears to be echoing the initial forum post. Skipping to prevent duplication.');
					return;
				}
			}
		}

		// Send text content if present
		if (messageContent.trim()) {
			await discordThread.send(messageContent);
			LogEngine.info(`Sent text message to Discord thread ${discordThread.id}`);
		}

		// Process files if present
		if (hasFiles && data.files && data.files.length > 0) {
			LogEngine.info(`Processing ${data.files.length} files from pre-transformed data`);

			const { AttachmentHandler } = await import('../utils/attachmentHandler');
			const attachmentHandler = new AttachmentHandler();

			try {
				const attachmentResult = await attachmentHandler.downloadUnthreadFilesToDiscord(
					discordThread,
					data.files,
					messageContent.trim() || undefined,
				);

				if (attachmentResult.success) {
					LogEngine.info(`Successfully processed ${attachmentResult.processedCount} files`);
				}
				else {
					LogEngine.warn(`File processing partially failed: ${attachmentResult.errors.join(', ')}`);
				}
			}
			catch (error) {
				LogEngine.error('Failed to process files:', error);
			}
		}

		LogEngine.info(`Forwarded message from Unthread to Discord thread ${discordThread.id} using direct consumption`);
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
 * Handle oversized files with Discord user notification
 */
async function handleOversizedFiles(discordThread: any, totalSize: number, maxSizeBytes: number): Promise<void> {
	LogEngine.info('📎 Handling oversized files', {
		totalSize,
		maxSizeBytes,
	});

	// Send notification about size limits
	const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
	const actualSizeMB = Math.round(totalSize / (1024 * 1024) * 100) / 100;

	const embed = new EmbedBuilder()
		.setColor(0xFF9800)
		.setTitle('📎 Attachment Size Limit Exceeded')
		.setDescription(
			`**Files are too large to process** (${actualSizeMB}MB)\n` +
			`Maximum size limit is **${maxSizeMB}MB** per message.\n\n` +
			'Your agent can still see and access all files in the Unthread dashboard.',
		)
		.setFooter({ text: getBotFooter() })
		.setTimestamp();

	try {
		await discordThread.send({ embeds: [embed] });
		LogEngine.info('Sent oversized files notification to Discord thread');
	}
	catch (error) {
		LogEngine.error('Failed to send oversized files notification:', error);
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
		const { discordThread } = await findDiscordThreadByTicketId(conversation.id);

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
				text: getBotFooter(),
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
	};

	LogEngine.debug(`Sending message to Unthread conversation ${conversationId}:`, requestData);

	const conversationUrl = `https://api.unthread.io/api/conversations/${conversationId}`;
	const abortController = new AbortController();
	// 8 second timeout for request operations
	const timeoutId = setTimeout(() => abortController.abort(), 8000);

	try {
		// Get API key (guaranteed to exist due to startup validation)
		const apiKey = process.env.UNTHREAD_API_KEY!;

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

/**
 * Sends a message with file attachments to an Unthread conversation
 *
 * Uploads multiple file buffers to Unthread using FormData for multipart upload.
 * This is the core function for Discord → Unthread attachment processing.
 *
 * @param conversationId - Unthread conversation ID
 * @param onBehalfOf - User information for the message
 * @param message - Text message content
 * @param fileBuffers - Array of file buffers to upload
 * @returns Unthread API response
 * @throws {Error} When UNTHREAD_API_KEY is not set
 * @throws {Error} When API request fails or times out
 * @throws {Error} When file upload fails (4xx/5xx responses)
 *
 * @example
 * ```typescript
 * const response = await sendMessageWithAttachmentsToUnthread(
 *   'conv123',
 *   { name: 'John Doe', email: 'john@example.com' },
 *   'Here are the images',
 *   [fileBuffer1, fileBuffer2]
 * );
 * ```
 */
export async function sendMessageWithAttachmentsToUnthread(
	conversationId: string,
	onBehalfOf: { name: string; email: string },
	message: string,
	fileBuffers: FileBuffer[],
): Promise<UnthreadApiResponse<any>> {
	LogEngine.debug(`Sending message with ${fileBuffers.length} attachments to Unthread conversation ${conversationId}`);

	// Get API key (guaranteed to exist due to startup validation)
	const apiKey = process.env.UNTHREAD_API_KEY!;

	// Create FormData for multipart upload using proven Telegram bot approach
	const formData = new FormData();

	// Consolidate message data into single JSON payload to reduce field count
	const messagePayload = {
		body: {
			type: 'markdown',
			value: message,
		},
		onBehalfOf: onBehalfOf,
	};

	// Use 'json' field for consolidated message payload (reduces from 4+ fields to 2 fields)
	formData.append('json', JSON.stringify(messagePayload));

	// Add file attachments using 'attachments' field
	fileBuffers.forEach((fileBuffer, index) => {
		// Convert Buffer to Uint8Array for proper Blob compatibility
		const uint8Array = new Uint8Array(fileBuffer.buffer);
		const blob = new Blob([uint8Array], { type: fileBuffer.mimeType });
		formData.append('attachments', blob, fileBuffer.fileName);
		LogEngine.debug(`Added attachment ${index + 1}: ${fileBuffer.fileName} (${fileBuffer.size} bytes, ${fileBuffer.mimeType})`);
	});

	const abortController = new AbortController();
	// 30 second timeout for file uploads
	const timeoutId = setTimeout(() => abortController.abort(), 30000);

	try {
		const conversationUrl = `https://api.unthread.io/api/conversations/${conversationId}/messages`;
		LogEngine.debug(`POST ${conversationUrl} with consolidated JSON payload FormData upload (2 fields instead of 4+)`);

		const response = await fetch(conversationUrl, {
			method: 'POST',
			headers: {
				'X-API-KEY': apiKey,
				// Don't set Content-Type - let fetch set it with boundary for FormData
			},
			body: formData,
			signal: abortController.signal,
		});

		LogEngine.debug(`Upload response status: ${response.status}`);

		if (!response.ok) {
			const errorText = await response.text();
			LogEngine.error(`Failed to upload attachments to Unthread: ${response.status} - ${errorText}`);
			throw new Error(`Failed to upload attachments to Unthread: ${response.status}`);
		}

		const responseData = await response.json();
		LogEngine.info(`Successfully uploaded ${fileBuffers.length} attachments to Unthread:`, responseData);

		return {
			success: true,
			data: responseData,
		};

	}
	catch (error: any) {
		if (error.name === 'AbortError') {
			LogEngine.error(`File upload to Unthread conversation ${conversationId} timed out after 30 seconds`);
			throw new Error('File upload to Unthread timed out');
		}
		LogEngine.error('Error uploading attachments to Unthread:', error);
		throw error;
	}
	finally {
		clearTimeout(timeoutId);
	}
}