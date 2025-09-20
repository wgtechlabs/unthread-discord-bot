/**
 * Webhook Consumer - Clean Redis Queue Consumer
 *
 * Simple Redis-based queue consumer that processes webhook events from the Unthread
 * platform and routes them to appropriate handlers. Based on the proven pattern
 * from the unthread-telegram-bot.
 *
 * Features:
 * - Polls Redis queue for incoming webhook events
 * - Validates event structure and content
 * - Routes events to existing handleWebhookEvent function
 * - Reliable delivery with error handling
 * - Connection management with automatic reconnection
 *
 * @module sdk/webhook-consumer/WebhookConsumer
 */

import { createClient, RedisClientType } from 'redis';
import { LogEngine } from '../../config/logger';
import { WebhookPayload } from '../../types/unthread';
import { EventValidator } from './EventValidator';
import { handleWebhookEvent } from '../../services/unthread';

/**
 * WebhookConsumer configuration
 */
export interface WebhookConsumerConfig {
	redisUrl: string;
	queueName?: string;
	pollInterval?: number;
}

/**
 * WebhookConsumer - Simple Redis queue consumer for Unthread webhook events
 *
 * Replaces the complex BullMQ implementation with a simple, direct Redis consumption
 * pattern that matches the proven architecture used in the telegram bot.
 */
export class WebhookConsumer {
	private redisUrl: string;
	private queueName: string;
	private pollInterval: number;

	// Redis clients - separate clients for blocking and non-blocking operations
	private redisClient: RedisClientType | null = null;
	// Dedicated client for blPop operations
	private blockingRedisClient: RedisClientType | null = null;
	private isRunning: boolean = false;
	private pollTimer: NodeJS.Timeout | null = null;

	constructor(config: WebhookConsumerConfig) {
		this.redisUrl = config.redisUrl;
		this.queueName = config.queueName || 'unthread-events';
		// 1 second default
		this.pollInterval = config.pollInterval || 1000;
	}

	/**
	 * Initialize Redis connections
	 */
	async connect(): Promise<boolean> {
		try {
			if (!this.redisUrl) {
				throw new Error('Redis URL is required for webhook consumer');
			}

			// Create main Redis client for general operations
			this.redisClient = createClient({ url: this.redisUrl });
			await this.redisClient.connect();

			// Create dedicated Redis client for blocking operations (blPop)
			this.blockingRedisClient = createClient({ url: this.redisUrl });
			await this.blockingRedisClient.connect();

			LogEngine.info('Webhook consumer connected to Redis with isolated blocking client');
			return true;
		}
		catch (error) {
			LogEngine.error('Webhook consumer Redis connection failed:', error);
			throw error;
		}
	}

	/**
	 * Disconnect from Redis
	 */
	async disconnect(): Promise<void> {
		try {
			this.isRunning = false;

			if (this.pollTimer) {
				clearTimeout(this.pollTimer);
				this.pollTimer = null;
			}

			// Disconnect both Redis clients
			if (this.redisClient?.isOpen) {
				await this.redisClient.disconnect();
			}

			if (this.blockingRedisClient?.isOpen) {
				await this.blockingRedisClient.disconnect();
			}

			LogEngine.info('Webhook consumer disconnected from Redis');
		}
		catch (error) {
			LogEngine.error('Error disconnecting webhook consumer:', error);
		}
	}

	/**
	 * Start polling for events
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			LogEngine.warn('Webhook consumer is already running');
			return;
		}

		await this.connect();
		this.isRunning = true;
		LogEngine.info('Webhook consumer started - polling for events');

		// Start the polling loop
		this.scheduleNextPoll();
	}

	/**
	 * Stop polling for events
	 */
	async stop(): Promise<void> {
		this.isRunning = false;
		await this.disconnect();
		LogEngine.info('Webhook consumer stopped');
	}

	/**
	 * Schedule the next poll
	 */
	private scheduleNextPoll(): void {
		if (!this.isRunning) {
			return;
		}

		this.pollTimer = setTimeout(async () => {
			try {
				await this.pollForEvents();
			}
			catch (error) {
				LogEngine.error('Error during event polling:', error);
			}
			finally {
				// Schedule next poll only once per cycle, regardless of success or failure
				this.scheduleNextPoll();
			}
		}, this.pollInterval);
	}

	/**
	 * Poll Redis queue for new events
	 */
	private async pollForEvents(): Promise<void> {
		if (!this.blockingRedisClient || !this.blockingRedisClient.isOpen) {
			LogEngine.warn('Blocking Redis client not connected, skipping poll');
			return;
		}

		try {
			LogEngine.debug(`Polling Redis queue: ${this.queueName}`);

			// Check queue length first for debugging
			if (this.redisClient?.isOpen) {
				const queueLength = await this.redisClient.lLen(this.queueName);
				if (queueLength > 0) {
					LogEngine.info(`Found ${queueLength} events in queue ${this.queueName}`);
				}
			}

			// Get the next event from the queue using dedicated blocking client (1 second timeout)
			const result = await this.blockingRedisClient.blPop(this.queueName, 1);

			if (result) {
				LogEngine.info(`Received event from queue: ${this.queueName}`);
				const eventData = result.element;
				await this.processEvent(eventData);
			}
			else {
				LogEngine.debug(`No events in queue: ${this.queueName}`);
			}
		}
		catch (error) {
			LogEngine.error('Error polling for events:', error);
		}
	}

	/**
	 * Process a single event
	 * @param eventData - JSON string of the event
	 */
	private async processEvent(eventData: string): Promise<void> {
		try {
			LogEngine.info('🔄 Starting event processing', {
				eventDataLength: eventData.length,
				eventPreview: eventData.substring(0, 200) + '...',
			});

			// Parse the event
			let rawEvent: unknown;
			try {
				rawEvent = JSON.parse(eventData);
				LogEngine.info('✅ Event parsed successfully');
			}
			catch (parseError) {
				LogEngine.error('❌ Failed to parse event JSON', {
					error: (parseError as Error).message,
					eventData: eventData.substring(0, 500),
				});
				return;
			}

			// Handle webhook server wrapping structure
			let event: unknown;
			if (rawEvent && typeof rawEvent === 'object' && 'completeTransformedData' in rawEvent) {
				// Extract the actual event from webhook server wrapping
				const eventWrapper = rawEvent as { completeTransformedData: unknown };
				event = eventWrapper.completeTransformedData;
				LogEngine.debug('Extracted event from webhook server wrapper');
			}
			else {
				// Direct event structure
				event = rawEvent;
			}

			// Log full event payload at debug level to avoid log bloat
			LogEngine.debug('Complete webhook event payload', {
				completeEvent: JSON.stringify(event, null, 2),
			});

			// Validate the event
			LogEngine.info('Validating event...');

			if (!EventValidator.validate(event)) {
				LogEngine.warn('❌ Invalid event, skipping', {
					event: JSON.stringify(event, null, 2).substring(0, 1000) + '...',
				});
				return;
			}
			LogEngine.info('✅ Event validation passed');

			// Process the validated event using existing handler
			const validatedEvent = event as WebhookPayload;

			LogEngine.info(`🚀 Processing ${validatedEvent.type} event`);
			try {
				await handleWebhookEvent(validatedEvent);
				LogEngine.info(`✅ Event processed successfully: ${validatedEvent.type}`);
			}
			catch (handlerError) {
				LogEngine.error(`❌ Handler execution failed for ${validatedEvent.type}`, {
					error: (handlerError as Error).message,
					stack: (handlerError as Error).stack,
					conversationId: EventValidator.extractConversationId(validatedEvent.data),
				});
				throw handlerError;
			}

		}
		catch (error) {
			LogEngine.error('❌ Error processing event:', {
				error: (error as Error).message,
				stack: (error as Error).stack,
				eventDataPreview: eventData ? eventData.substring(0, 500) : 'null',
			});
		}
	}

	/**
	 * Get connection status
	 * @returns Status information
	 */
	getStatus(): {
		isRunning: boolean;
		isConnected: boolean;
		isBlockingClientConnected: boolean;
		queueName: string;
		} {
		return {
			isRunning: this.isRunning,
			isConnected: this.redisClient?.isOpen ?? false,
			isBlockingClientConnected: this.blockingRedisClient?.isOpen ?? false,
			queueName: this.queueName,
		};
	}

	/**
	 * Health check for monitoring
	 */
	async healthCheck(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		redis: boolean;
		blockingRedis: boolean;
		polling: boolean;
	}> {
		try {
			// Test Redis connections
			const redisHealthy = this.redisClient?.isOpen ?? false;
			const blockingRedisHealthy = this.blockingRedisClient?.isOpen ?? false;

			// Test Redis ping if connected
			if (redisHealthy) {
				await this.redisClient!.ping();
			}

			if (blockingRedisHealthy) {
				await this.blockingRedisClient!.ping();
			}

			const allHealthy = redisHealthy && blockingRedisHealthy && this.isRunning;
			const degraded = (redisHealthy || blockingRedisHealthy) && this.isRunning;

			return {
				status: allHealthy ? 'healthy' : degraded ? 'degraded' : 'unhealthy',
				redis: redisHealthy,
				blockingRedis: blockingRedisHealthy,
				polling: this.isRunning,
			};

		}
		catch (error) {
			LogEngine.error('Webhook consumer health check failed:', error);
			return {
				status: 'unhealthy',
				redis: false,
				blockingRedis: false,
				polling: false,
			};
		}
	}
}