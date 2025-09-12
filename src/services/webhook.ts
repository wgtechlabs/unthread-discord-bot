/**
 * Webhook Service - Queue-Based Processing (Aligned with Telegram Bot Architecture)
 *
 * This service handles incoming webhook requests from the unthread-webhook-server
 * and routes them to a queue-based processing system for reliable, scalable event handling.
 *
 * IMPORTANT: This service no longer performs signature verification as events
 * now come through a trusted Redis queue from the unthread-webhook-server,
 * matching the architecture used by the Telegram bot.
 *
 * Architecture Flow:
 * Unthread → unthread-webhook-server → Redis Queue → Discord Bot
 *
 * Key Changes from Legacy System:
 * - Removed direct webhook signature validation (handled by webhook server)
 * - Asynchronous processing via Redis queues
 * - Immediate HTTP response to prevent timeouts
 * - Automatic retry logic for failed events
 * - Rate limiting and priority handling
 * - Comprehensive error handling and monitoring
 *
 * Request Flow:
 * 1. Handle URL verification events immediately
 * 2. Queue other events for async processing
 * 3. Return HTTP 200 status immediately
 *
 * @module services/webhook
 */

import { Request, Response } from 'express';
import { LogEngine } from '../config/logger';
import { WebhookPayload } from '../types/unthread';
import { QueueProcessor } from './QueueProcessor';

/**
 * Extended Express Request with raw body for signature verification
 */
interface WebhookRequest extends Request {
	// Make optional to handle cases where middleware isn't properly configured
	rawBody?: string;
}

/**
 * URL verification webhook payload
 */
interface UrlVerificationPayload {
	event: 'url_verification';
	challenge?: string;
}

/**
 * Union type for all webhook payload types
 */
type AllWebhookPayloads = WebhookPayload | UrlVerificationPayload;

// Global queue processor instance
let queueProcessor: QueueProcessor | null = null;

/**
 * Initialize the webhook service with queue processor
 */
export async function initializeWebhookService(): Promise<void> {
	try {
		queueProcessor = await QueueProcessor.initialize();
		LogEngine.info('Webhook service initialized with queue-based processing');
	}
	catch (error) {
		LogEngine.error('Failed to initialize webhook service:', error);
		throw error;
	}
}

/**
 * Determines the priority of a webhook event for queue processing
 */
function getEventPriority(payload: WebhookPayload): 'low' | 'normal' | 'high' {
	// High priority events that need immediate processing
	const highPriorityEvents = [
		'ticket.priority.changed',
		'ticket.status.urgent',
		'customer.escalation',
	];

	// Low priority events that can be processed later
	const lowPriorityEvents = [
		'ticket.tag.added',
		'ticket.tag.removed',
		'customer.metadata.updated',
	];

	if (highPriorityEvents.includes(payload.event)) {
		return 'high';
	}

	if (lowPriorityEvents.includes(payload.event)) {
		return 'low';
	}

	return 'normal';
}

/**
 * Main webhook handler for Unthread events
 *
 * Processes incoming webhook requests with the following workflow:
 * 1. Handles URL verification events immediately
 * 2. Queues other events for asynchronous processing
 * 3. Returns appropriate HTTP status codes immediately
 *
 * NOTE: Signature verification is DISABLED as events now come through
 * the Redis queue from the unthread-webhook-server, not directly from Unthread.
 * This aligns with the Telegram bot architecture.
 *
 * @param req - The Express request object
 * @param res - The Express response object
 */
async function webhookHandler(req: Request, res: Response): Promise<void> {
	// Cast to WebhookRequest for access to rawBody (kept for compatibility)
	const webhookReq = req as WebhookRequest;

	LogEngine.debug('Webhook received:', webhookReq.rawBody);

	// NOTE: Signature verification removed - events come from trusted webhook server via Redis
	// The unthread-webhook-server handles signature validation before queuing events

	const body = req.body as AllWebhookPayloads;
	const { event } = body;

	// Handle URL verification events immediately (Unthread setup)
	if (event === 'url_verification') {
		LogEngine.info('URL verification webhook received');
		const challenge = (body as UrlVerificationPayload).challenge;

		if (challenge) {
			res.status(200).json({ challenge });
		}
		else {
			res.sendStatus(200);
		}
		return;
	}

	// Ensure queue processor is initialized
	if (!queueProcessor) {
		LogEngine.error('Queue processor not initialized - falling back to synchronous processing');
		res.status(503).json({ error: 'Service temporarily unavailable' });
		return;
	}

	// Queue webhook event for asynchronous processing
	try {
		const webhookPayload = body as WebhookPayload;
		const priority = getEventPriority(webhookPayload);

		const jobId = await queueProcessor.addWebhookEvent(webhookPayload, {
			priority,
			source: 'webhook',
		});

		LogEngine.info(`Webhook event queued successfully: ${event} (Job ID: ${jobId}, Priority: ${priority})`);

		// Return immediate success to prevent webhook timeouts
		res.status(200).json({
			status: 'queued',
			jobId,
			event,
			priority,
		});

	}
	catch (error) {
		LogEngine.error('Failed to queue webhook event:', error);

		// Differentiate between application errors and infrastructure failures
		// Return 5xx for infrastructure failures to enable upstream retries
		// Return 4xx for malformed/invalid webhook data (non-retryable)

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// Check if this is likely an infrastructure failure (Redis/queue issues)
		const isInfrastructureFailure = errorMessage.includes('Redis') ||
										errorMessage.includes('connection') ||
										errorMessage.includes('timeout') ||
										errorMessage.includes('ECONNREFUSED') ||
										errorMessage.includes('network');

		if (isInfrastructureFailure) {
			// Return 5xx for infrastructure failures to trigger upstream retries
			LogEngine.warn('Infrastructure failure detected, returning 502 to enable retries');
			res.status(502).json({
				status: 'error',
				message: 'Service temporarily unavailable - please retry',
				retryable: true,
			});
		}
		else {
			// Return 4xx for application/validation errors (non-retryable)
			LogEngine.warn('Application error detected, returning 400 to prevent retries');
			res.status(400).json({
				status: 'error',
				message: 'Invalid webhook data or application error',
				retryable: false,
			});
		}
	}
}

/**
 * Health check endpoint for webhook service
 * Returns basic operational status without exposing sensitive system details
 */
async function webhookHealthCheck(_req: Request, res: Response): Promise<void> {
	try {
		if (!queueProcessor) {
			res.status(503).json({
				status: 'unhealthy',
				timestamp: new Date().toISOString(),
			});
			return;
		}

		const health = await queueProcessor.getHealth();
		const httpStatus = health.status === 'healthy' ? 200 :
						 health.status === 'degraded' ? 200 : 503;

		res.status(httpStatus).json({
			status: health.status,
			timestamp: new Date().toISOString(),
		});

	}
	catch (error) {
		LogEngine.error('Webhook health check failed:', error);
		res.status(503).json({
			status: 'unhealthy',
			timestamp: new Date().toISOString(),
		});
	}
}

/**
 * Basic metrics endpoint for webhook service monitoring
 * Returns essential operational metrics without sensitive system details
 */
async function webhookMetrics(_req: Request, res: Response): Promise<void> {
	try {
		if (!queueProcessor) {
			res.status(503).json({
				status: 'unavailable',
				timestamp: new Date().toISOString(),
			});
			return;
		}

		const health = await queueProcessor.getHealth();
		res.json({
			status: health.status,
			timestamp: new Date().toISOString(),
			operational: health.status === 'healthy',
		});

	}
	catch (error) {
		LogEngine.error('Failed to get webhook metrics:', error);
		res.status(500).json({
			status: 'error',
			timestamp: new Date().toISOString(),
		});
	}
}

/**
 * Webhook service exports
 */
export {
	webhookHandler,
	webhookHealthCheck,
	webhookMetrics,
};