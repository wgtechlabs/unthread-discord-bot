const { createHmac } = require('crypto');
const { handleWebhookEvent: unthreadWebhookHandler } = require('./unthread');
const logger = require('../utils/logger');

const SIGNING_SECRET = process.env.UNTHREAD_WEBHOOK_SECRET;

function verifySignature(req) {
  const rawBody = req.rawBody;
  const hmac = createHmac('sha256', SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');
    
  return hmac === req.get('x-unthread-signature');
}

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