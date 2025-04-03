const redis = require('../utils/database');
const { handleWebhookEvent } = require('./unthread');

// Keys for the Redis queue
const QUEUE_KEY = 'unthread:webhook:queue';
const PROCESSING_KEY = 'unthread:webhook:processing';

/**
 * Process webhooks from the queue
 * @returns {Promise<number>} - Number of processed webhooks
 */
async function processWebhookQueue() {
  try {
    // Get the queue array directly - it will be null if it doesn't exist
    const queueString = await redis.get(QUEUE_KEY);
    
    // If key doesn't exist or is empty, initialize it
    if (!queueString) {
      await redis.set(QUEUE_KEY, JSON.stringify([]));
      console.log('Queue initialized as empty array');
      return 0;
    }
    
    try {
      // Try to parse the queue string as JSON
      const queue = JSON.parse(queueString);
      
      if (!Array.isArray(queue)) {
        console.log('Queue is not an array. Resetting queue.');
        await redis.set(QUEUE_KEY, JSON.stringify([]));
        return 0;
      }
      
      // Add debug logging to see queue status
      console.log(`Webhook queue check: ${queue.length} items in queue`);
      
      if (queue.length === 0) {
        return 0; // Queue is empty
      }
      
      const queueItem = queue[0];
      const { payload, id } = queueItem;
      
      console.log(`Processing webhook: ${id}, event type: ${payload.event}`);
      
      // Check if this webhook is already being processed
      const isProcessing = await redis.get(`${PROCESSING_KEY}:${id}`);
      if (isProcessing) {
        console.log(`Skipping webhook ${id} - already processing`);
        return 0; // Skip if already being processing
      }
      
      // Mark as processing
      await redis.set(`${PROCESSING_KEY}:${id}`, Date.now(), { EX: 300 });
      
      // Process the webhook
      await handleWebhookEvent(payload);
      
      // Remove from queue after successful processing
      const updatedQueue = queue.slice(1);
      // Stringify before saving to Redis
      await redis.set(QUEUE_KEY, JSON.stringify(updatedQueue));
      console.log(`Successfully processed webhook: ${id}, event: ${payload.event}`);
      
      return 1; // Successfully processed one webhook
    } catch (parseError) {
      // If parsing fails, the data is not valid JSON
      console.error('Error parsing queue data:', parseError);
      await redis.set(QUEUE_KEY, JSON.stringify([]));
      return 0;
    }
  } catch (error) {
    console.error('Error processing webhook from queue:', error);
    return 0;
  }
}

/**
 * Start webhook queue processing with interval
 * @param {number} interval - Interval in milliseconds
 */
function startWebhookConsumer(interval = 5000) {
  console.log('Starting webhook consumer...');
  setInterval(async () => {
    try {
      const processed = await processWebhookQueue();
      if (processed > 0) {
        console.log(`Processed ${processed} webhooks from queue`);
      }
    } catch (error) {
      console.error('Error in webhook consumer:', error);
    }
  }, interval);
}

module.exports = { startWebhookConsumer, processWebhookQueue };