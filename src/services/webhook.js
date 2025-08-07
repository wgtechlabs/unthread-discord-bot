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

const { createHmac } = require('crypto');
const { handleWebhookEvent: unthreadWebhookHandler } = require('./unthread');
const logger = require('../utils/logger');

const SIGNING_SECRET = process.env.UNTHREAD_WEBHOOK_SECRET;

/**
 * Verifies the HMAC signature of incoming webhook requests
 * 
 * Uses the webhook signing secret to verify that the request comes from Unthread.
 * This prevents unauthorized webhook calls from malicious sources.
 * 
 * @param {Express.Request} req - The Express request object containing headers and body
 * @returns {boolean} True if signature is valid, false otherwise
 */
function verifySignature(req) {
  const rawBody = req.rawBody;
  const hmac = createHmac('sha256', SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');
    
  return hmac === req.get('x-unthread-signature');
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
 * @param {Express.Request} req - The Express request object
 * @param {Express.Response} res - The Express response object
 * @returns {void} Sends HTTP response
 */
function webhookHandler(req, res) {
  logger.debug('Webhook received:', req.rawBody);
  if (!verifySignature(req)) {
    logger.error('Signature verification failed.');
    res.sendStatus(403);
    return;
  }

  const { event, data } = req.body;

  // Respond to URL verification events
  if (event === 'url_verification') {
    res.sendStatus(200);
    return;
  }
  
  // Process other webhook events coming from Unthread
  unthreadWebhookHandler(req.body);

  res.sendStatus(200);
}

module.exports = { webhookHandler };