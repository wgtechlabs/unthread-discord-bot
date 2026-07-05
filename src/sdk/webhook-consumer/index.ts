/**
 * Webhook Consumer SDK - Clean Interface
 *
 * Exports the clean Redis-based webhook consumption components
 * that replace the complex BullMQ implementation.
 *
 * @module sdk/webhook-consumer
 */

export { EventValidator } from './EventValidator';
export type { WebhookConsumerConfig } from './WebhookConsumer';
export { WebhookConsumer } from './WebhookConsumer';
