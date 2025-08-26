/**
 * Webhook Service Module
 *
 * Handles incoming webhooks from Unthread for ticket synchronization.
 * Now implements Redis queue-based processing instead of direct event handling.
 *
 * Migration Notes:
 * - Webhooks are now queued to Redis instead of processed directly
 * - File attachments are detected and queued with metadata
 * - Event deduplication and retry logic handled by queue system
 * - Maintains backward compatibility with existing webhook structure
 *
 * Features:
 * - HMAC signature verification for security
 * - URL verification for webhook setup
 * - Redis queue integration for event processing
 * - File attachment detection and metadata extraction
 * - Comprehensive error handling and logging
 *
 * @module services/webhook
 */

import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookPayload } from '../types/unthread';
import { LogEngine } from '../config/logger';
import { RedisQueueManager, WebhookEvent } from './queue';
import { AttachmentMetadata, DISCORD_ATTACHMENT_CONFIG } from '../config/attachments';

const SIGNING_SECRET = process.env.UNTHREAD_WEBHOOK_SECRET;

// Global queue manager instance
let queueManager: RedisQueueManager | null = null;

/**
 * Initialize the queue manager for webhook processing
 */
async function initializeWebhookQueue(): Promise<void> {
	if (!queueManager) {
		queueManager = new RedisQueueManager();
		await queueManager.initialize();
		LogEngine.info('Webhook queue manager initialized');
	}
}

/**
 * Get the queue manager instance
 */
function getQueueManager(): RedisQueueManager | null {
	return queueManager;
}

/**
 * Extended Express Request with raw body for signature verification
 */
interface WebhookRequest extends Request {
	rawBody: string;
}

/**
 * URL verification webhook payload
 */
interface UrlVerificationPayload {
	event: 'url_verification';
	challenge?: string;
}

/**
 * Combined webhook payload types
 */
type WebhookEventPayload = WebhookPayload | UrlVerificationPayload;

/**
 * Verifies the HMAC signature of incoming webhook requests
 *
 * Uses the webhook signing secret to verify that the request comes from Unthread.
 * This prevents unauthorized webhook calls from malicious sources.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param req - The Express request object containing headers and body
 * @returns True if signature is valid, false otherwise
 */
function verifySignature(req: WebhookRequest): boolean {
	if (!SIGNING_SECRET) {
		LogEngine.error('UNTHREAD_WEBHOOK_SECRET not configured');
		return false;
	}

	const rawBody = req.rawBody;
	const computed = createHmac('sha256', SIGNING_SECRET)
		.update(rawBody)
		.digest('hex');

	const receivedSignature = req.get('x-unthread-signature') || '';

	// Use constant-time comparison to prevent timing attacks
	const a = Buffer.from(computed, 'hex');
	const b = Buffer.from(receivedSignature, 'hex');

	// If lengths don't match, signatures are definitely different
	if (a.length !== b.length) {
		return false;
	}

	// Use timing-safe comparison for the actual signature check
	return timingSafeEqual(a, b);
}

/**
 * Main webhook handler for Unthread events
 *
 * Processes incoming webhook requests with the following workflow:
 * 1. Verifies the signature for security
 * 2. Handles URL verification events for initial setup
 * 3. Queues other events to Redis for processing by the consumer
 * 4. Returns appropriate HTTP status codes
 *
 * @param req - The Express request object
 * @param res - The Express response object
 */
async function webhookHandler(req: Request, res: Response): Promise<void> {
	// Cast to WebhookRequest for access to rawBody
	const webhookReq = req as WebhookRequest;

	LogEngine.debug('Webhook received:', webhookReq.rawBody);

	if (!verifySignature(webhookReq)) {
		LogEngine.error('Signature verification failed.');
		res.sendStatus(403);
		return;
	}

	const body = req.body as WebhookEventPayload;
	const { event } = body;

	// Respond to URL verification events
	if (event === 'url_verification') {
		LogEngine.info('URL verification webhook received');
		res.sendStatus(200);
		return;
	}

	// Queue webhook events for processing instead of handling directly
	try {
		if (!queueManager) {
			throw new Error('Queue manager not initialized. Call initializeWebhookQueue() first.');
		}

		const webhookPayload = body as WebhookPayload;
		const webhookEvent = await convertToWebhookEvent(webhookPayload);

		// Queue the event with appropriate priority
		const priority = determineEventPriority(webhookEvent);
		const eventId = await queueManager.queueWebhookEvent(webhookEvent, priority);

		LogEngine.info(`Queued webhook event ${eventId} (type: ${event}) with priority ${priority}`);

	}
	catch (error) {
		LogEngine.error('Error queuing webhook event:', error);
		// Still return 200 to prevent webhook retries for queue errors
		// The event will be logged and can be manually reprocessed if needed
	}

	res.sendStatus(200);
}

/**
 * Webhook service exports
 */
export { webhookHandler, initializeWebhookQueue, getQueueManager };

/**
 * Convert Unthread webhook payload to standardized webhook event
 *
 * @param payload - Original Unthread webhook payload
 * @returns Promise<WebhookEvent> Standardized event for queue processing
 */
async function convertToWebhookEvent(payload: WebhookPayload): Promise<Partial<WebhookEvent>> {
	const webhookEvent: Partial<WebhookEvent> = {
		eventId: '', // Will be generated by queue manager
		sourcePlatform: 'unthread',
		targetPlatform: 'discord',
		eventType: mapUnthreadEventType(payload.event),
		timestamp: new Date().toISOString(),
		data: {
			content: extractMessageContent(payload),
			conversationId: extractConversationId(payload),
			conversation: payload.data.conversation,
			message: payload.data.message,
		},
		originalEvent: payload as unknown as Record<string, unknown>,
	};

	// Detect and process file attachments if present
	const attachmentMetadata = await detectAttachments(payload);
	if (attachmentMetadata.hasFiles) {
		webhookEvent.attachments = attachmentMetadata;
		webhookEvent.eventType = 'attachment';
		if (webhookEvent.data) {
			webhookEvent.data.files = extractFileData(payload);
		}
	}

	return webhookEvent;
}

/**
 * Map Unthread event types to standardized event types
 *
 * @param unthreadEvent - Original Unthread event type
 * @returns Standardized event type
 */
function mapUnthreadEventType(unthreadEvent: string): WebhookEvent['eventType'] {
	const eventMap: Record<string, WebhookEvent['eventType']> = {
		'conversation.message.created': 'message_created',
		'conversation.status.updated': 'conversation_updated',
		'conversation.created': 'thread_create',
		'message_created': 'message_created',
	};

	return eventMap[unthreadEvent] || 'message';
}

/**
 * Extract message content from webhook payload
 *
 * @param payload - Webhook payload
 * @returns Message content string
 */
function extractMessageContent(payload: WebhookPayload): string | undefined {
	return payload.data.message?.markdown || payload.data.text;
}

/**
 * Extract conversation ID from webhook payload
 *
 * @param payload - Webhook payload
 * @returns Conversation ID
 */
function extractConversationId(payload: WebhookPayload): string | undefined {
	return payload.data.conversationId || payload.data.conversation?.id || payload.data.id;
}

/**
 * Detect file attachments in webhook payload
 *
 * @param payload - Webhook payload
 * @returns Promise<AttachmentMetadata> Attachment metadata
 */
async function detectAttachments(payload: WebhookPayload): Promise<AttachmentMetadata> {
	const metadata: AttachmentMetadata = {
		hasFiles: false,
		fileCount: 0,
		totalSize: 0,
		types: [],
		supportedCount: 0,
		validationErrors: [],
	};

	// Check for files in various payload locations
	const files = payload.data.files || payload.data.attachments || [];

	if (files && files.length > 0) {
		metadata.hasFiles = true;
		metadata.fileCount = files.length;

		for (const file of files) {
			if (file.size) {
				metadata.totalSize += file.size;
			}

			if (file.mimeType || file.type) {
				const mimeType = file.mimeType || file.type;
				if (mimeType) {
					metadata.types.push(mimeType);

					// Check if supported format
					if (DISCORD_ATTACHMENT_CONFIG.supportedFormats.includes(mimeType as any)) {
						metadata.supportedCount++;
					}
				}
			}
		}

		// Validate file limits
		if (metadata.fileCount > DISCORD_ATTACHMENT_CONFIG.maxFiles) {
			metadata.validationErrors!.push(DISCORD_ATTACHMENT_CONFIG.errors.tooManyFiles);
		}

		if (metadata.totalSize > DISCORD_ATTACHMENT_CONFIG.maxTotalSize) {
			metadata.validationErrors!.push('Total file size exceeds limit');
		}
	}

	// Also check message content for attachment references
	const messageContent = extractMessageContent(payload);
	if (messageContent) {
		// Look for attachment patterns in message content
		const attachmentPatterns = [
			/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi,
			/\[.*?\]\(https?:\/\/[^\s)]+\)/gi, // Markdown links
			/attachment:\s*https?:\/\/[^\s]+/gi,
		];

		for (const pattern of attachmentPatterns) {
			const matches = messageContent.match(pattern);
			if (matches && matches.length > 0 && !metadata.hasFiles) {
				metadata.hasFiles = true;
				metadata.fileCount = matches.length;
				LogEngine.debug(`Detected ${matches.length} attachment references in message content`);
			}
		}
	}

	return metadata;
}

/**
 * Extract file data from webhook payload
 *
 * @param payload - Webhook payload
 * @returns Array of file data objects
 */
function extractFileData(payload: WebhookPayload): Array<{
	id: string;
	name: string;
	size: number;
	mimeType: string;
	url?: string;
}> {
	const files = payload.data.files || payload.data.attachments || [];

	return files.map((file, index) => ({
		id: file.id || `file_${index}`,
		name: file.name || file.filename || `attachment_${index}`,
		size: file.size || 0,
		mimeType: file.mimeType || file.type || 'application/octet-stream',
		url: file.url || file.download_url,
	}));
}

/**
 * Determine event priority for queue processing
 *
 * @param event - Webhook event
 * @returns Priority level (higher = more urgent)
 */
function determineEventPriority(event: Partial<WebhookEvent>): number {
	// Priority levels:
	// 3 = High priority (conversation status changes)
	// 2 = Medium priority (attachments)
	// 1 = Normal priority (regular messages)
	// 0 = Low priority (other events)

	switch (event.eventType) {
	case 'conversation_updated':
		return 3;
	case 'attachment':
		return 2;
	case 'message_created':
	case 'message':
		return 1;
	default:
		return 0;
	}
}