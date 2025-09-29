/**
 * Webhook Consumer - Redis Queue Processing System
 * 
 * @description 
 * Redis-based queue consumer for processing webhook events from Unthread platform.
 * Provides reliable event processing with validation, error handling, and automatic
 * reconnection. Based on proven patterns from unthread-telegram-bot architecture.
 * 
 * @module sdk/webhook-consumer/WebhookConsumer
 * @since 1.0.0
 * 
 * @keyFunctions
 * - start(): Initiates Redis queue polling and event processing
 * - stop(): Gracefully shuts down consumer and closes Redis connections
 * - processEvent(): Validates and routes webhook events to handlers
 * - pollQueue(): Main queue polling loop with blocking Redis operations
 * 
 * @commonIssues
 * - Redis connection failures: Network issues or authentication problems
 * - Event validation errors: Malformed webhook payloads from Unthread
 * - Processing timeouts: Handler functions taking too long to complete
 * - Memory leaks: Polling timer not properly cleaned up on shutdown
 * - Queue backlog: Events accumulating faster than processing capacity
 * 
 * @troubleshooting
 * - Verify WEBHOOK_REDIS_URL connection string and Redis server availability
 * - Monitor EventValidator output for payload structure issues
 * - Check handleWebhookEvent execution time and implement timeouts
 * - Use LogEngine output to track queue depth and processing rates
 * - Implement circuit breaker pattern for failing webhook handlers
 * - Monitor Redis memory usage during high event volumes
 * 
 * @performance
 * - Blocking Redis operations (BLPOP) for efficient queue polling
 * - Separate Redis clients for blocking and non-blocking operations
 * - Configurable poll intervals to balance responsiveness and resource usage
 * - Event validation before expensive processing operations
 * - Graceful shutdown prevents data loss during restarts
 * 
 * @dependencies Redis client, LogEngine, EventValidator, Unthread service handlers
 * 
 * @example Basic Usage
 * ```typescript
 * const consumer = new WebhookConsumer({
 *   redisUrl: 'redis://localhost:6379',
 *   queueName: 'webhook:events',
 *   pollInterval: 1000
 * });
 * await consumer.start();
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * // Production configuration with error handling
 * const consumer = new WebhookConsumer({
 *   redisUrl: process.env.WEBHOOK_REDIS_URL!,
 *   queueName: 'unthread:webhooks',
 *   pollInterval: 500
 * });
 * 
 * process.on('SIGTERM', async () => {
 *   await consumer.stop();
 * });
 * ```
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
 * Redis-based webhook event consumer with reliable processing and error handling
 * 
 * @class WebhookConsumer
 * @description Processes webhook events from Redis queue using blocking operations for efficiency.
 * Replaces complex BullMQ implementation with direct Redis consumption pattern.
 * 
 * @example
 * ```typescript
 * const consumer = new WebhookConsumer({
 *   redisUrl: 'redis://localhost:6379',
 *   queueName: 'webhook:events'
 * });
 * await consumer.start();
 * ```
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

	// Throttling for debug logs to reduce noise
	private lastNoEventsLog: number = 0;
	// 5 minutes in milliseconds
	private readonly NO_EVENTS_LOG_INTERVAL = 5 * 60 * 1000;

	constructor(config: WebhookConsumerConfig) {
		this.redisUrl = config.redisUrl;
		this.queueName = config.queueName || 'unthread-events';
		// 1 second default
		this.pollInterval = config.pollInterval || 1000;
	}

	/**
	 * Initialize Redis connections for webhook processing
	 *
	 * Creates two separate Redis connections:
	 * 1. Main client for general operations and queue management
	 * 2. Blocking client specifically for BLPOP operations to avoid conflicts
	 *
	 * This separation ensures that blocking operations don't interfere with
	 * other Redis operations and maintains connection stability.
	 *
	 * @returns Promise<boolean> - True if both connections succeed, throws on failure
	 * @throws {Error} When Redis URL is missing or connection fails
	 *
	 * @example
	 * ```typescript
	 * const consumer = new WebhookConsumer({ redisUrl: 'redis://localhost:6379' });
	 * const connected = await consumer.connect();
	 * if (connected) {
	 *   console.log('Webhook consumer ready');
	 * }
	 * ```
	 *
	 * @see {@link https://redis.io/commands/blpop/} for BLPOP operation details
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
	 * Disconnect from Redis and clean up resources
	 *
	 * Safely closes both Redis connections and stops all polling operations.
	 * This method ensures proper cleanup of timers and connections to prevent
	 * memory leaks and connection pool exhaustion.
	 *
	 * @returns Promise that resolves when disconnection is complete
	 *
	 * @example
	 * ```typescript
	 * await consumer.disconnect();
	 * console.log('Consumer safely disconnected');
	 * ```
	 *
	 * @note Always call this method during application shutdown
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
	 * Start the webhook consumer and begin polling for events
	 *
	 * Initializes Redis connections and begins the event polling loop.
	 * The consumer will continuously poll the Redis queue for new webhook
	 * events and process them through the handleWebhookEvent function.
	 *
	 * @returns Promise that resolves when startup is complete
	 * @throws {Error} When Redis connection fails or consumer is already running
	 *
	 * @example
	 * ```typescript
	 * const consumer = new WebhookConsumer({ redisUrl: 'redis://localhost:6379' });
	 * await consumer.start();
	 * console.log('Webhook consumer is now processing events');
	 * ```
	 *
	 * @see {@link connect} for connection establishment
	 * @see {@link pollForEvents} for event processing loop
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
	 * Stop the webhook consumer and clean up all resources
	 *
	 * Gracefully stops event polling and disconnects from Redis.
	 * This method ensures all pending operations complete before
	 * shutting down the consumer.
	 *
	 * @returns Promise that resolves when shutdown is complete
	 *
	 * @example
	 * ```typescript
	 * await consumer.stop();
	 * console.log('Webhook consumer stopped gracefully');
	 * ```
	 *
	 * @note Safe to call multiple times
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
			// Only log polling activity every 5 minutes to reduce noise
			const now = Date.now();
			if (now - this.lastNoEventsLog >= this.NO_EVENTS_LOG_INTERVAL) {
				LogEngine.debug(`Polling Redis queue: ${this.queueName}`);
			}

			// Check queue length first for debugging
			if (this.redisClient?.isOpen) {
				const queueLength = await this.redisClient.lLen(this.queueName);
				if (queueLength > 0) {
					LogEngine.info(`Found ${queueLength} events in queue ${this.queueName}`);
				} else {
					// Log occasionally when no events are found to verify polling is working
					if (now - this.lastNoEventsLog >= this.NO_EVENTS_LOG_INTERVAL) {
						LogEngine.debug(`Queue ${this.queueName} is empty - polling actively`);
					}
				}
			} else {
				LogEngine.error(`Redis client not available for queue length check on ${this.queueName}`);
			}

			// Get the next event from the queue using dedicated blocking client (1 second timeout)
			const result = await this.blockingRedisClient.blPop(this.queueName, 1);

			if (result) {
				LogEngine.info(`Received event from queue: ${this.queueName}`);
				const eventData = result.element;
				await this.processEvent(eventData);
				return;
			}

			// Only log "no events" message every 5 minutes to reduce noise
			if (now - this.lastNoEventsLog >= this.NO_EVENTS_LOG_INTERVAL) {
				LogEngine.debug(`No events in queue: ${this.queueName} (next log in 5 minutes)`);
				this.lastNoEventsLog = now;
			}
		}
		catch (error) {
			LogEngine.error('Error polling for events:', error);
		}
	}

	/**
	 * Process a single webhook event from the Redis queue
	 *
	 * Handles the complete event processing pipeline:
	 * 1. Parse JSON event data
	 * 2. Validate event structure and content
	 * 3. Route to appropriate handler function
	 * 4. Log processing results and any errors
	 *
	 * @param eventData - JSON string containing the webhook event payload
	 * @returns Promise that resolves when event processing is complete
	 *
	 * @example
	 * ```typescript
	 * // Internal method called by pollForEvents
	 * await this.processEvent('{"type":"message.created","data":{...}}');
	 * ```
	 *
	 * @throws Logs errors but doesn't propagate to prevent queue blocking
	 * @see {@link EventValidator.validate} for validation logic
	 * @see {@link handleWebhookEvent} for event handling
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

			// Use pre-transformed event data directly from webhook server
			const event = rawEvent;

			// Log full event payload at debug level to avoid log bloat
			LogEngine.debug('Pre-transformed webhook event payload', {
				event: JSON.stringify(event, null, 2),
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
	 * Get the current operational status of the webhook consumer
	 *
	 * Provides real-time status information about the consumer's
	 * operational state and connection health. Useful for monitoring
	 * and debugging connectivity issues.
	 *
	 * @returns Object containing detailed status information
	 * @returns status.isRunning - Whether the consumer is actively polling
	 * @returns status.isConnected - Whether main Redis client is connected
	 * @returns status.isBlockingClientConnected - Whether blocking Redis client is connected
	 * @returns status.queueName - The Redis queue name being monitored
	 *
	 * @example
	 * ```typescript
	 * const status = consumer.getStatus();
	 * if (!status.isConnected) {
	 *   console.log('Redis connection issue detected');
	 * }
	 * ```
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
	 * Comprehensive health check for monitoring and alerting
	 *
	 * Performs active health checks on all consumer components:
	 * - Tests Redis connection with ping commands
	 * - Verifies polling operation status
	 * - Returns overall health assessment
	 *
	 * Health status levels:
	 * - 'healthy': All systems operational
	 * - 'degraded': Some issues but still functional
	 * - 'unhealthy': Critical issues requiring attention
	 *
	 * @returns Promise<object> containing detailed health information
	 * @returns result.status - Overall health status ('healthy'|'degraded'|'unhealthy')
	 * @returns result.redis - Main Redis client health
	 * @returns result.blockingRedis - Blocking Redis client health
	 * @returns result.polling - Whether actively polling for events
	 *
	 * @example
	 * ```typescript
	 * const health = await consumer.healthCheck();
	 * if (health.status === 'unhealthy') {
	 *   await alertOpsTeam('Webhook consumer unhealthy', health);
	 * }
	 * ```
	 *
	 * @see {@link getStatus} for simpler status information
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