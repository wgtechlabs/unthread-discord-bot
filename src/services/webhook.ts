/**
 * Webhook Service Module
 *
 * Handles incoming webhooks from Unthread for ticket synchronization.
 * Provides signature verification and event routing for secure webhook processing.
 *
 * Features:
 * - HMAC signature verification for security
 * - URL verification for webhook setup
 * - Event routing to appropriate handlers
 *
 * @module services/webhook
 */

import { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { WebhookPayload } from '../types/unthread';
import { LogEngine } from '../config/logger';
// @ts-ignore - JavaScript module without type declarations
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
	const hmac = createHmac('sha256', SIGNING_SECRET)
		.update(rawBody)
		.digest('hex');

	const receivedSignature = req.get('x-unthread-signature');
	return hmac === receivedSignature;
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
function webhookHandler(req: Request, res: Response): void {
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
		unthreadWebhookHandler(body as WebhookPayload);
		LogEngine.debug(`Successfully processed webhook event: ${event}`);
	}
	catch (error) {
		LogEngine.error('Error processing webhook event:', error);
		// Still return 200 to prevent webhook retries for application errors
	}

	res.sendStatus(200);
}

/**
 * Webhook service exports
 */
export { webhookHandler };