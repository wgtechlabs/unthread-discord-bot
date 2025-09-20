/**
 * Unthread Service Module
 *
 * This module handles all interaction with the Unthread API for the Discord bot.
 * It manages customer records, ticket creation/retrieval, and webhook event processing.
 * All communication between Discord and Unthread is managed through these functions.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This is the core integration layer with Unthread's API. Understanding this module
 * is crucial for debugging ticket creation, message sync, and webhook processing issues.
 *
 * Key Features:
 * - Customer creation and management
 * - Ticket creation and status updates
 * - Webhook event processing for real-time synchronization
 * - Message forwarding between Discord and Unthread
 * - Thread-to-ticket mapping management
 *
 * 🔄 API INTEGRATION PATTERNS:
 * ===========================
 * - All API calls use fetch() with proper error handling
 * - Automatic retry logic for transient failures
 * - Rate limiting respect via backoff strategies
 * - Comprehensive logging for debugging
 *
 * 🐛 DEBUGGING API ISSUES:
 * =======================
 * - Check UNTHREAD_API_KEY validity and permissions
 * - Monitor rate limiting (429 responses)
 * - Verify webhook signature validation
 * - Review customer/ticket mapping consistency
 * - Check network connectivity to api.unthread.io
 *
 * 🚨 COMMON INTEGRATION ISSUES:
 * ============================
 * - Authentication: API key invalid or expired
 * - Rate limits: Too many requests, implement backoff
 * - Data consistency: Thread-ticket mappings out of sync
 * - Webhook processing: Events not being handled properly
 * - Customer creation: Duplicate emails or invalid data
 *
 * @module services/unthread
 */

import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';
import { BotsStore, ExtendedThreadTicketMapping } from '../sdk/bots-brain/BotsStore';
import { getBotFooter } from '../utils/botUtils';
import { EmbedBuilder, User } from 'discord.js';
import { LogEngine } from '../config/logger';
import { isDuplicateMessage } from '../utils/messageUtils';
import { findDiscordThreadByTicketId, findDiscordThreadByTicketIdWithRetry } from '../utils/threadUtils';
import { getOrCreateCustomer, getCustomerByDiscordId, Customer } from '../utils/customerUtils';
import { UnthreadApiResponse, UnthreadTicket, WebhookPayload, MessageAttachment } from '../types/unthread';
import { FileBuffer } from '../types/attachments';
import { getConfig, DEFAULT_CONFIG } from '../config/defaults';

/**
 * ==================== ENVIRONMENT VALIDATION ====================
 * Preflight checks to ensure required environment variables are present
 */

/**
 * Validates critical environment variables required for Unthread service
 *
 * @throws {Error} When required environment variables are missing
 * @example
 * ```typescript
 * import { validateEnvironment } from './services/unthread';
 *
 * // Call during application initialization
 * validateEnvironment();
 * ```
 */
export function validateEnvironment(): void {
	const requiredEnvVars = [
		{ name: 'UNTHREAD_API_KEY', value: process.env.UNTHREAD_API_KEY },
		{ name: 'UNTHREAD_SLACK_CHANNEL_ID', value: process.env.UNTHREAD_SLACK_CHANNEL_ID },
		{ name: 'SLACK_TEAM_ID', value: process.env.SLACK_TEAM_ID },
	];

	const missingVars = requiredEnvVars.filter(envVar => !envVar.value?.trim());

	if (missingVars.length > 0) {
		const missingNames = missingVars.map(v => v.name).join(', ');
		LogEngine.error(`Missing required environment variables: ${missingNames}`);
		LogEngine.error('Please ensure all required environment variables are set before starting the application.');
		throw new Error(`Missing required environment variables: ${missingNames}`);
	}

	LogEngine.info('Unthread environment validation passed - all required variables are set');
}

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

	// Get API key (guaranteed to exist due to startup validation)
	const apiKey = process.env.UNTHREAD_API_KEY!;

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
	const { type, data } = payload;

	LogEngine.info(`Processing webhook event: ${type}`);
	LogEngine.debug('Event data:', data);
	
	// DIAGNOSTIC: Log the complete payload structure to understand what we're receiving
	LogEngine.debug('DIAGNOSTIC: Complete payload structure', {
		payloadType: typeof payload,
		payloadKeys: Object.keys(payload as unknown as Record<string, unknown>),
		payloadHasAttachments: !!(payload as unknown as Record<string, unknown>).attachments,
		completePayload: JSON.stringify(payload, null, 2),
	});

	try {
		switch (type) {
		case 'message_created':
			// Extract attachment metadata from webhook payload root level (not from data)
			// The webhook consumer should have preserved the attachment metadata from the webhook server
			const webhookAttachments = (payload as unknown as Record<string, unknown>).attachments as WebhookAttachments | undefined;
			
			LogEngine.debug('🔍 DEBUGGING: Webhook payload attachment extraction', {
				hasAttachmentsInPayload: !!webhookAttachments,
				payloadHasAttachments: !!(payload as unknown as Record<string, unknown>).attachments,
				attachmentSummary: webhookAttachments ? `${webhookAttachments.fileCount} files (${Math.round(webhookAttachments.totalSize / 1024)}KB)` : 'none',
				payloadKeys: Object.keys(payload as unknown as Record<string, unknown>),
				// NEW: Look for actual attachment objects in the payload
				rawAttachments: (payload as unknown as Record<string, unknown>).attachments,
				dataHasFiles: !!(data as Record<string, unknown>).files,
				dataHasAttachments: !!(data as Record<string, unknown>).attachments,
			});
			
			await handleMessageCreated(data as Record<string, unknown>, webhookAttachments);
			break;
		case 'conversation_updated':
			await handleStatusUpdated(data as Record<string, unknown>);
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
 * Webhook attachment metadata structure for Discord bot
 * Based on proven Telegram bot implementation
 */
interface WebhookAttachments {
	hasFiles: boolean;
	fileCount: number;
	totalSize: number;
	types: string[];
	names: string[];
}

/**
 * Enhanced webhook event structure with attachment metadata
 */
interface WebhookEvent {
	type: string;
	data: Record<string, unknown>;
	attachments?: WebhookAttachments;
}

/**
 * Attachment Detection Service for Discord Bot
 * Implements metadata-driven attachment detection using proven Telegram bot patterns
 */
class AttachmentDetectionService {
	/**
	 * Primary event validation - only process dashboard → discord events
	 * Replaces complex multi-source event routing
	 */
	static shouldProcessEvent(_event: WebhookEvent): boolean {
		// For Discord bot, we process all events since we only receive dashboard events
		return true;
	}

	/**
	 * Primary attachment detection using webhook metadata
	 * Replaces complex array checking and location detection
	 */
	static hasAttachments(event: WebhookEvent): boolean {
		return this.shouldProcessEvent(event) &&
			   event.attachments?.hasFiles === true;
	}

	/**
	 * Image-specific detection for enhanced attachment processing
	 * Uses metadata types array for instant categorization
	 */
	static hasImageAttachments(event: WebhookEvent): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}

		return event.attachments?.types?.some(type =>
			type.startsWith('image/'),
		) ?? false;
	}

	/**
	 * Supported image type validation with configuration
	 * Only processes image types we can handle reliably
	 */
	static hasSupportedImages(event: WebhookEvent): boolean {
		if (!this.hasImageAttachments(event)) {
			return false;
		}

		const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

		return event.attachments?.types?.some(type =>
			supportedTypes.includes(type.toLowerCase()),
		) ?? false;
	}

	/**
	 * Check for unsupported file types (non-images)
	 * Enables clear user communication about what we can't process yet
	 */
	static hasUnsupportedAttachments(event: WebhookEvent): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}

		// If we have attachments but no supported images, they're unsupported
		return !this.hasSupportedImages(event);
	}

	/**
	 * Size validation using pre-calculated metadata
	 * No need to iterate through files for size calculation
	 */
	static isWithinSizeLimit(event: WebhookEvent, maxSizeBytes: number): boolean {
		if (!this.hasAttachments(event)) {
			return true;
		}
		return (event.attachments?.totalSize ?? 0) <= maxSizeBytes;
	}

	/**
	 * Check if files exceed size limits
	 * Enables specific messaging for oversized files
	 */
	static isOversized(event: WebhookEvent, maxSizeBytes: number): boolean {
		if (!this.hasAttachments(event)) {
			return false;
		}
		return (event.attachments?.totalSize ?? 0) > maxSizeBytes;
	}

	/**
	 * Get attachment summary for logging/UI
	 * Ready-to-use summary without manual calculation
	 */
	static getAttachmentSummary(event: WebhookEvent): string {
		if (!this.hasAttachments(event)) {
			return 'No attachments';
		}
		
		const attachments = event.attachments;
		if (!attachments) {
			return 'No attachments';
		}
		
		const { fileCount, totalSize, types } = attachments;
		const sizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
		const typeList = types.join(', ');
		
		return `${fileCount} files (${sizeMB}MB) - ${typeList}`;
	}

	/**
	 * Get file count without array access
	 * Instant count from metadata
	 */
	static getFileCount(event: WebhookEvent): number {
		return event.attachments?.fileCount || 0;
	}

	/**
	 * Get total size without calculation
	 * Pre-calculated size from metadata
	 */
	static getTotalSize(event: WebhookEvent): number {
		return event.attachments?.totalSize || 0;
	}

	/**
	 * Get unique file types without iteration
	 * Deduplicated types from metadata
	 */
	static getFileTypes(event: WebhookEvent): string[] {
		return event.attachments?.types || [];
	}

	/**
	 * Get file names with guaranteed correlation to data.files
	 * names[i] corresponds to data.files[i]
	 */
	static getFileNames(event: WebhookEvent): string[] {
		return event.attachments?.names || [];
	}

	/**
	 * Validate metadata consistency (trust but verify)
	 * Ensures webhook metadata matches actual file data
	 */
	static validateConsistency(event: WebhookEvent): boolean {
		if (!this.shouldProcessEvent(event)) {
			return false;
		}
		
		const metadata = event.attachments;
		const files = event.data.files as unknown[] | undefined;
		
		// No files scenario - both should be empty/false
		if (!metadata?.hasFiles && (!files || files.length === 0)) {
			return true;
		}
		
		// Has files scenario - counts should match
		if (metadata?.hasFiles && files && files.length === metadata.fileCount) {
			return true;
		}
		
		// Inconsistency detected
		LogEngine.warn('Attachment metadata inconsistency detected', {
			metadataHasFiles: metadata?.hasFiles,
			metadataCount: metadata?.fileCount,
			actualFilesCount: files?.length || 0,
			conversationId: event.data.conversationId
		});
		
		return false;
	}

	/**
	 * Generate processing decision summary
	 * Helpful for logging and debugging
	 */
	static getProcessingDecision(event: WebhookEvent, maxSizeBytes: number = 10 * 1024 * 1024): {
		shouldProcess: boolean;
		hasAttachments: boolean;
		hasImages: boolean;
		hasSupportedImages: boolean;
		hasUnsupported: boolean;
		isOversized: boolean;
		summary: string;
		reason: string;
	} {
		const shouldProcess = this.shouldProcessEvent(event);
		const hasAttachments = this.hasAttachments(event);
		const hasImages = this.hasImageAttachments(event);
		const hasSupportedImages = this.hasSupportedImages(event);
		const hasUnsupported = this.hasUnsupportedAttachments(event);
		const isOversized = this.isOversized(event, maxSizeBytes);
		const summary = this.getAttachmentSummary(event);
		
		let reason = '';
		if (!shouldProcess) {
			reason = 'Non-dashboard event';
		} else if (!hasAttachments) {
			reason = 'No attachments';
		} else if (isOversized) {
			reason = 'Files too large';
		} else if (hasUnsupported) {
			reason = 'Unsupported file types';
		} else if (hasSupportedImages) {
			reason = 'Ready for image processing';
		} else {
			reason = 'Unknown state';
		}
		
		return {
			shouldProcess,
			hasAttachments,
			hasImages,
			hasSupportedImages,
			hasUnsupported,
			isOversized,
			summary,
			reason
		};
	}
}

/**
 * Handles message creation webhook events
 * Enhanced with metadata-driven attachment detection from Telegram bot patterns
 *
 * @param data - Webhook event data
 * @param attachments - Optional attachment metadata from webhook
 * @returns Promise<void>
 */
async function handleMessageCreated(data: Record<string, unknown>, attachments?: WebhookAttachments): Promise<void> {
	// Check if message originated from Discord to avoid duplication
	if (data.metadata && (data.metadata as Record<string, unknown>).source === 'discord') {
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
	 *
	 * EXCEPTION: Allow dashboard file attachment events (they have files but no userId due to Slack file upload behavior)
	 */
	const fileArray = (data.files as unknown[]) || (data.attachments as unknown[]) || [];
	const isDashboardFileAttachment = !data.userId && fileArray.length > 0 && data.text === 'File attached';

	if (!data.userId && !isDashboardFileAttachment) {
		LogEngine.debug(`Message has no userId (likely from bot/system), skipping to prevent duplication loops. ConversationId: ${data.conversationId || data.id}`);
		return;
	}

	const conversationId = data.conversationId || data.id;
	const messageText = data.text;

	// Enhanced attachment detection using metadata-driven approach from Telegram bot
	const webhookEvent: WebhookEvent = {
		type: 'message_created',
		data,
		...(attachments && { attachments }),
	};

	// Use the proven Telegram bot processing decision pattern
	const maxSizeBytes = 10 * 1024 * 1024; // 10MB like Telegram bot
	const processingDecision = AttachmentDetectionService.getProcessingDecision(webhookEvent, maxSizeBytes);

	LogEngine.info('� Attachment processing decision (using Telegram bot pattern)', {
		conversationId,
		shouldProcess: processingDecision.shouldProcess,
		reason: processingDecision.reason,
		hasAttachments: processingDecision.hasAttachments,
		hasImages: processingDecision.hasImages,
		hasSupportedImages: processingDecision.hasSupportedImages,
		summary: processingDecision.summary,
		metadataConsistent: AttachmentDetectionService.validateConsistency(webhookEvent),
		messageText: data.text,
	});

	// COMPATIBILITY: Maintain existing fileArray for backward compatibility during transition
	const fileArray = (data.files as unknown[]) || (data.attachments as unknown[]) || [];

	// Skip "File attached" messages that are just attachment notifications like in Telegram bot
	const isFileAttachedNotification = messageText &&
		messageText.trim().toLowerCase() === 'file attached' &&
		processingDecision.hasAttachments;

	if (isFileAttachedNotification) {
		LogEngine.info('� Processing file-only message (skipping "File attached" text)', {
			conversationId,
			hasAttachments: processingDecision.hasAttachments,
			attachmentSummary: processingDecision.summary,
		});

		// Process attachments only, skip the text like Telegram bot
		if (processingDecision.hasSupportedImages) {
			await processImageAttachments(webhookEvent, conversationId);
		}
		return;
	}

	// Message must have either meaningful text content OR attachments
	if ((!messageText || messageText.trim().length === 0) && !processingDecision.hasAttachments) {
		LogEngine.warn('❌ Empty message with no attachments in webhook event', {
			conversationId,
			hasContent: !!data.content,
			hasText: !!data.text,
			hasAttachments: processingDecision.hasAttachments,
		});
		return;
	}

	// Handle different processing decisions like Telegram bot
	if (processingDecision.hasUnsupported) {
		LogEngine.warn('📎 Unsupported attachment types detected', {
			conversationId,
			attachmentSummary: processingDecision.summary,
		});
		// For now, continue processing the text - future enhancement: send notification about unsupported files
	}

	if (processingDecision.isOversized) {
		LogEngine.warn('📎 Oversized attachments detected', {
			conversationId,
			attachmentSummary: processingDecision.summary,
			maxSizeMB: Math.round(maxSizeBytes / (1024 * 1024)),
		});
		// For now, continue processing the text - future enhancement: send notification about size limits
	}

	if (!conversationId || (!messageText && !processingDecision.hasAttachments)) {
		LogEngine.warn('Message created event missing required data (must have text or at least one attachment)');
		return;
	}

	// Extract timestamp from Slack-formatted message ID for duplicate detection
	const messageId = data.id;
	const slackTimestamp = messageId && typeof messageId === 'string' ? messageId.split('-').pop()?.split('.')[0] : null;

	if (slackTimestamp) {
		// Check if we have any records of a message deleted within a short window
		const currentTime = Date.now();
		// Convert to milliseconds
		const messageTimestamp = parseInt(slackTimestamp) * 1000;

		// Only process if the message isn't too old (prevents processing old messages)
		// Within 10 seconds
		if (currentTime - messageTimestamp < 10000) {
			// Check recent deleted messages in this channel
			const ticketMapping = await getTicketByUnthreadTicketId(conversationId as string);

			// If we can't find the thread mapping, proceed with sending the message
			if (!ticketMapping) {
				LogEngine.debug(`No Discord thread found for Unthread ticket ${conversationId as string}, proceeding with message`);
			}
			else {
				const botsStore = BotsStore.getInstance();
				const deletedMessagesKey = `deleted:channel:${ticketMapping.discordThreadId}`;
				const recentlyDeletedMessages = (await botsStore.getBotConfig<Array<Record<string, unknown>>>(deletedMessagesKey)) || [];

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
		const retryOptions = {
			maxAttempts: 3,
			// 10 seconds - reasonable for new ticket creation
			maxRetryWindow: 10000,
			// 1 second base delay
			baseDelayMs: 1000,
		};

		const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
			conversationId as string,
			retryOptions,
		);

		if (!discordThread) {
			LogEngine.warn(`No Discord thread found for conversation ${conversationId as string}`);
			return;
		}

		// Process and clean the message content
		const messageContent = decodeHtmlEntities(messageText as string);

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

		if (messageContent.trim() || effectiveAttachments.length > 0) {
			// Process attachments if present
			if (effectiveAttachments.length > 0) {
				LogEngine.info(`Processing ${effectiveAttachments.length} attachments from Unthread message`);

				// Import AttachmentHandler and process the attachments
				const { AttachmentHandler } = await import('../utils/attachmentHandler');
				const attachmentHandler = new AttachmentHandler();

				try {
					const attachmentResult = await attachmentHandler.downloadUnthreadAttachmentsToDiscord(
						discordThread,
						effectiveAttachments as MessageAttachment[],
						messageContent.trim() || undefined,
					);

					if (attachmentResult.success) {
						LogEngine.info(`Successfully processed ${attachmentResult.processedCount} attachments from Unthread`);
					}
					else {
						LogEngine.warn(`Attachment processing partially failed: ${attachmentResult.errors.join(', ')}`);

						// Still send the text message if attachment processing failed
						if (messageContent.trim()) {
							await discordThread.send(messageContent);
						}
					}
				}
				catch (error) {
					LogEngine.error('Failed to process Unthread attachments:', error);

					// Send text message as fallback
					if (messageContent.trim()) {
						await discordThread.send(messageContent);
					}
				}
			}
			else if (messageContent.trim()) {
				// Send as a regular Discord bot message if no attachments
				await discordThread.send(messageContent);
			}

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

	// Create FormData for multipart upload using the proven Telegram bot pattern
	const formData = new FormData();

	// Create message payload as JSON (single field approach like Telegram bot)
	const messagePayload = {
		body: {
			type: 'markdown',
			value: message,
		},
		onBehalfOf: {
			name: onBehalfOf.name,
			email: onBehalfOf.email,
		},
	};

	// Use the proven field structure from Telegram bot: 'json' field for message payload
	formData.append('json', JSON.stringify(messagePayload));

	LogEngine.info('FormData structure: Using proven Telegram bot pattern (json + attachments fields)');
	LogEngine.info(`Number of file buffers to upload: ${fileBuffers.length}`);

	// Add file attachments using 'attachments' field (consistent with Telegram bot)
	fileBuffers.forEach((fileBuffer, index) => {
		// Convert Buffer to Uint8Array for proper Blob compatibility
		const uint8Array = new Uint8Array(fileBuffer.buffer);
		const blob = new Blob([uint8Array], { type: fileBuffer.mimeType });
		formData.append('attachments', blob, fileBuffer.fileName);
		LogEngine.info(`Added attachment ${index + 1}: ${fileBuffer.fileName} (${fileBuffer.size} bytes, ${fileBuffer.mimeType})`);
	});

	// Calculate total fields: 1 json field + attachment files (much fewer fields)
	const totalFields = 1 + fileBuffers.length;
	LogEngine.info(`Total FormData fields being sent: ${totalFields} (1 json + ${fileBuffers.length} attachments)`);

	const abortController = new AbortController();
	// 30 second timeout for file uploads
	const timeoutId = setTimeout(() => abortController.abort(), 30000);

	try {
		const conversationUrl = `https://api.unthread.io/api/conversations/${conversationId}/messages`;
		LogEngine.debug(`POST ${conversationUrl} with FormData upload`);

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