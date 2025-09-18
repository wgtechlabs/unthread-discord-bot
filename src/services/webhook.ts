/**
 * Webhook Service Module
 *
 * Handles incoming webhooks from Unthread for ticket synchronization.
 * Provides signature verification and event routing for secure webhook processing.
 *
 * Note: This now handles direct webhook processing while the WebhookConsumer
 * handles events from the Redis queue populated by the webhook server.
 *
 * Features:
 * - HMAC signature verification for security
 * - URL verification for webhook setup
 * - Direct event routing to appropriate handlers
 *
 * @module services/webhook
 */

import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookPayload } from '../types/unthread';
import { LogEngine } from '../config/logger';
import { handleWebhookEvent as unthreadWebhookHandler } from './unthread';

const SIGNING_SECRET = process.env.UNTHREAD_WEBHOOK_SECRET;

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
		LogEngine.warn('Webhook signing secret not configured - signature verification disabled');
		// Allow requests when secret is not configured
		return true;
	}

	const signature = req.headers['x-signature-256'] as string;
	if (!signature) {
		LogEngine.warn('Missing webhook signature header');
		return false;
	}

	const expectedSignature = createHmac('sha256', SIGNING_SECRET)
		.update(req.rawBody)
		.digest('hex');

	const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`, 'utf8');
	const receivedBuffer = Buffer.from(signature, 'utf8');

	// Use constant-time comparison to prevent timing attacks
	if (expectedBuffer.length !== receivedBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Main webhook handler for Unthread events
 *
 * Processes incoming webhook requests with the following workflow:
 * 1. Verifies the signature for security
 * 2. Handles URL verification events for initial setup
 * 3. Routes other events to the appropriate handler
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

	// Process other webhook events coming from Unthread
	try {
		await unthreadWebhookHandler(body as WebhookPayload);
		LogEngine.debug(`Successfully processed webhook event: ${event}`);
	}
	catch (error) {
		LogEngine.error('Error processing webhook event:', error);
		// Still return 200 to prevent webhook retries for application errors
	}

	res.sendStatus(200);
}

/**
 * Health check endpoint for webhook service
 * Returns basic operational status without exposing sensitive system details
 */
async function webhookHealthCheck(_req: Request, res: Response): Promise<void> {
	try {
		res.status(200).json({
			status: 'healthy',
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
		res.json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			operational: true,
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