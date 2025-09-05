/**
 * Webhook Service - Queue-Based Processing
 *
 * This service handles incoming webhook requests from Unthread and routes them
 * to a queue-based processing system for reliable, scalable event handling.
 *
 * Key Changes from Legacy System:
 * - Asynchronous processing via Redis queues
 * - Immediate HTTP response to prevent timeouts
 * - Automatic retry logic for failed events
 * - Rate limiting and priority handling
 * - Comprehensive error handling and monitoring
 *
 * Request Flow:
 * 1. Verify webhook signature for security
 * 2. Handle URL verification events immediately
 * 3. Queue other events for async processing
 * 4. Return HTTP 200 status immediately
 *
 * @module services/webhook
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { LogEngine } from '../config/logger';
import { WebhookPayload } from '../types/unthread';
import { QueueProcessor } from './QueueProcessor';

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
 * Verifies webhook signature using HMAC-SHA256
 *
 * Uses the webhook signing secret to verify that the request comes from Unthread.
 * This prevents unauthorized webhook calls from malicious sources.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param req - The Express request object containing headers and body
 * @returns True if signature is valid, false otherwise
 */
function verifySignature(req: WebhookRequest): boolean {
	const { UNTHREAD_WEBHOOK_SECRET } = process.env;

	if (!UNTHREAD_WEBHOOK_SECRET) {
		LogEngine.error('UNTHREAD_WEBHOOK_SECRET is not configured');
		return false;
	}

	const signature = req.headers['x-unthread-signature'] as string;
	if (!signature) {
		LogEngine.error('Missing x-unthread-signature header');
		return false;
	}

	try {
		const expectedSignature = crypto
			.createHmac('sha256', UNTHREAD_WEBHOOK_SECRET)
			.update(req.rawBody)
			.digest('hex');

		const expected = `sha256=${expectedSignature}`;

		// Use constant-time comparison to prevent timing attacks
		const sigBuf = Buffer.from(signature);
		const expBuf = Buffer.from(expected);

		// Prevent crash by checking buffer lengths match
		if (sigBuf.length !== expBuf.length) {
			return false;
		}

		return crypto.timingSafeEqual(sigBuf, expBuf);
	}
	catch (error) {
		LogEngine.error('Signature verification error:', error);
		return false;
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
 * 1. Verifies the signature for security
 * 2. Handles URL verification events immediately
 * 3. Queues other events for asynchronous processing
 * 4. Returns appropriate HTTP status codes immediately
 *
 * @param req - The Express request object
 * @param res - The Express response object
 */
async function webhookHandler(req: Request, res: Response): Promise<void> {
	// Cast to WebhookRequest for access to rawBody
	const webhookReq = req as WebhookRequest;

	LogEngine.debug('Webhook received:', webhookReq.rawBody);

	// Verify signature for security
	if (!verifySignature(webhookReq)) {
		LogEngine.error('Webhook signature verification failed');
		res.status(403).json({ error: 'Invalid signature' });
		return;
	}

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

		// Still return 200 to prevent webhook retries for application errors
		// The error will be logged and can be investigated separately
		res.status(200).json({
			status: 'error',
			message: 'Event received but processing failed',
		});
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