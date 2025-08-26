/**
 * Redis Queue Infrastructure
 *
 * Provides Redis-based queue management for webhook events with comprehensive
 * event queuing, consumption, and retry mechanisms. This replaces the direct
 * webhook processing with a robust queuing system.
 *
 * Features:
 * - Event queuing with priority support
 * - Dead letter queue for failed events
 * - Retry logic with exponential backoff
 * - Event deduplication
 * - Comprehensive monitoring and metrics
 *
 * @module services/queue
 */

import { createClient, RedisClientType } from 'redis';
import { LogEngine } from '../config/logger';
import { randomUUID } from 'crypto';

/**
 * Webhook event structure for queue processing
 */
export interface WebhookEvent {
	eventId: string;
	sourcePlatform: 'unthread' | 'discord';
	targetPlatform: 'discord' | 'unthread';
	eventType: 'message' | 'attachment' | 'thread_create' | 'conversation_updated' | 'message_created';
	timestamp: string;
	data: {
		content?: string;
		files?: Array<{
			id: string;
			name: string;
			size: number;
			mimeType: string;
			url?: string;
		}>;
		// Discord-specific fields
		channelId?: string;
		messageId?: string;
		threadId?: string;
		// Unthread-specific fields
		conversationId?: string;
		conversation?: {
			id: string;
			friendlyId?: string;
			title?: string;
			status: string;
		};
		message?: {
			id: string;
			markdown: string;
			authorName: string;
			authorEmail: string;
			createdAt: string;
		};
	};
	// File attachment metadata
	attachments?: {
		hasFiles: boolean;
		fileCount: number;
		totalSize: number;
		types: string[];
		supportedCount: number;
		validationErrors?: string[];
	};
	// Queue metadata
	priority?: number;
	retryCount?: number;
	maxRetries?: number;
	originalEvent?: Record<string, unknown>;
}

/**
 * Queue configuration constants
 */
export const QUEUE_CONFIG = {
	// Queue names
	webhookQueue: 'webhook:events',
	deadLetterQueue: 'webhook:dead_letter',
	processingQueue: 'webhook:processing',

	// Processing settings
	batchSize: 10,
	maxConcurrentProcessors: 3,
	processingTimeout: 30000, // 30 seconds

	// Retry settings
	defaultMaxRetries: 3,
	retryBaseDelay: 1000,
	retryMaxDelay: 30000,

	// Deduplication settings
	deduplicationTTL: 300, // 5 minutes
	deduplicationKeyPrefix: 'dedup:',

	// Monitoring settings
	metricsRetention: 86400, // 24 hours
	healthCheckInterval: 30000, // 30 seconds
} as const;

/**
 * Redis Queue Manager
 *
 * Manages Redis-based event queuing with comprehensive error handling,
 * retry logic, and monitoring capabilities.
 */
export class RedisQueueManager {
	private client: RedisClientType;
	private isConnected = false;
	private processingActive = false;
	private processors: Map<string, Promise<void>> = new Map();

	constructor() {
		// Create Redis client using existing REDIS_URL
		this.client = createClient({
			url: process.env.REDIS_URL,
		});

		this.setupEventHandlers();
	}

	/**
	 * Initialize Redis connection and queue infrastructure
	 */
	async initialize(): Promise<void> {
		try {
			await this.client.connect();
			this.isConnected = true;
			LogEngine.info('Redis queue manager connected successfully');

			// Initialize queue structures
			await this.initializeQueues();

		}
		catch (error) {
			LogEngine.error('Failed to initialize Redis queue manager:', error);
			throw error;
		}
	}

	/**
	 * Setup Redis client event handlers
	 */
	private setupEventHandlers(): void {
		this.client.on('error', (error) => {
			LogEngine.error('Redis queue client error:', error);
			this.isConnected = false;
		});

		this.client.on('connect', () => {
			LogEngine.debug('Redis queue client connected');
		});

		this.client.on('disconnect', () => {
			LogEngine.warn('Redis queue client disconnected');
			this.isConnected = false;
		});

		this.client.on('reconnecting', () => {
			LogEngine.info('Redis queue client reconnecting...');
		});
	}

	/**
	 * Initialize queue structures and indexes
	 */
	private async initializeQueues(): Promise<void> {
		// Ensure required queues exist and are properly configured
		const queues = [
			QUEUE_CONFIG.webhookQueue,
			QUEUE_CONFIG.deadLetterQueue,
			QUEUE_CONFIG.processingQueue,
		];

		for (const queueName of queues) {
			const exists = await this.client.exists(queueName);
			if (!exists) {
				// Initialize as empty list
				await this.client.lPush(queueName, 'QUEUE_INITIALIZED');
				await this.client.lPop(queueName);
				LogEngine.debug(`Initialized queue: ${queueName}`);
			}
		}
	}

	/**
	 * Add webhook event to processing queue
	 *
	 * @param event - Webhook event to queue
	 * @param priority - Optional priority (higher numbers = higher priority)
	 * @returns Promise<string> Event ID for tracking
	 */
	async queueWebhookEvent(event: Partial<WebhookEvent>, priority = 0): Promise<string> {
		const eventId = randomUUID();
		const webhookEvent: WebhookEvent = {
			eventId,
			sourcePlatform: 'unthread',
			targetPlatform: 'discord',
			eventType: 'message',
			timestamp: new Date().toISOString(),
			data: {},
			priority,
			retryCount: 0,
			maxRetries: QUEUE_CONFIG.defaultMaxRetries,
			...event,
		};

		// Check for duplicate events
		const isDuplicate = await this.checkDuplicateEvent(webhookEvent);
		if (isDuplicate) {
			LogEngine.debug(`Duplicate event detected, skipping: ${eventId}`);
			return eventId;
		}

		try {
			// Add to queue with priority support
			const eventData = JSON.stringify(webhookEvent);

			if (priority > 0) {
				// High priority events go to the front
				await this.client.lPush(QUEUE_CONFIG.webhookQueue, eventData);
			}
			else {
				// Normal priority events go to the back
				await this.client.rPush(QUEUE_CONFIG.webhookQueue, eventData);
			}

			// Store deduplication key
			await this.storeDuplicationKey(webhookEvent);

			LogEngine.info(`Queued webhook event ${eventId} with priority ${priority}`);

			// Update metrics
			await this.updateQueueMetrics('queued', webhookEvent.eventType);

			return eventId;

		}
		catch (error) {
			LogEngine.error(`Failed to queue webhook event ${eventId}:`, error);
			throw error;
		}
	}

	/**
	 * Process queued webhook events
	 *
	 * @param processorId - Unique processor identifier
	 * @param eventProcessor - Function to process individual events
	 * @returns Promise<void>
	 */
	async processQueueEvents(
		processorId: string,
		eventProcessor: (event: WebhookEvent) => Promise<void>,
	): Promise<void> {
		if (this.processors.has(processorId)) {
			LogEngine.warn(`Processor ${processorId} is already running`);
			return;
		}

		const processingPromise = this.startEventProcessor(processorId, eventProcessor);
		this.processors.set(processorId, processingPromise);

		try {
			await processingPromise;
		}
		finally {
			this.processors.delete(processorId);
		}
	}

	/**
	 * Start continuous event processing
	 */
	private async startEventProcessor(
		processorId: string,
		eventProcessor: (event: WebhookEvent) => Promise<void>,
	): Promise<void> {
		LogEngine.info(`Starting event processor: ${processorId}`);

		while (this.isConnected && this.processingActive) {
			try {
				// Get events from queue (blocking with timeout)
				const result = await this.client.blPop(
					QUEUE_CONFIG.webhookQueue,
					5, // 5 second timeout
				);

				if (result) {
					const eventData = JSON.parse(result.element) as WebhookEvent;
					await this.processEvent(eventData, eventProcessor);
				}

			}
			catch (error) {
				LogEngine.error(`Error in event processor ${processorId}:`, error);
				// Brief delay before retrying to avoid rapid error loops
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		LogEngine.info(`Event processor ${processorId} stopped`);
	}

	/**
	 * Process a single webhook event with error handling
	 */
	private async processEvent(
		event: WebhookEvent,
		eventProcessor: (event: WebhookEvent) => Promise<void>,
	): Promise<void> {
		const startTime = Date.now();

		try {
			LogEngine.debug(`Processing event ${event.eventId} (type: ${event.eventType})`);

			// Move to processing queue for tracking
			await this.client.rPush(QUEUE_CONFIG.processingQueue, JSON.stringify(event));

			// Process the event
			await eventProcessor(event);

			// Remove from processing queue on success
			await this.removeFromProcessingQueue(event.eventId);

			// Update metrics
			const processingTime = Date.now() - startTime;
			await this.updateQueueMetrics('processed', event.eventType, processingTime);

			LogEngine.info(`Successfully processed event ${event.eventId} in ${processingTime}ms`);

		}
		catch (error) {
			LogEngine.error(`Failed to process event ${event.eventId}:`, error);

			// Remove from processing queue
			await this.removeFromProcessingQueue(event.eventId);

			// Handle retry logic
			await this.handleEventFailure(event, error as Error);
		}
	}

	/**
	 * Handle event processing failure with retry logic
	 */
	private async handleEventFailure(event: WebhookEvent, error: Error): Promise<void> {
		const retryCount = (event.retryCount || 0) + 1;
		const maxRetries = event.maxRetries || QUEUE_CONFIG.defaultMaxRetries;

		if (retryCount <= maxRetries) {
			// Calculate retry delay with exponential backoff
			const delay = Math.min(
				QUEUE_CONFIG.retryBaseDelay * Math.pow(2, retryCount - 1),
				QUEUE_CONFIG.retryMaxDelay,
			);

			LogEngine.info(`Retrying event ${event.eventId} (attempt ${retryCount}/${maxRetries}) in ${delay}ms`);

			// Update retry count and re-queue with delay
			const retryEvent = { ...event, retryCount };

			setTimeout(async () => {
				try {
					await this.client.rPush(QUEUE_CONFIG.webhookQueue, JSON.stringify(retryEvent));
				}
				catch (retryError) {
					LogEngine.error(`Failed to re-queue event ${event.eventId}:`, retryError);
					await this.moveToDeadLetterQueue(event, error);
				}
			}, delay);

		}
		else {
			// Max retries exceeded, move to dead letter queue
			LogEngine.error(`Event ${event.eventId} failed after ${maxRetries} attempts, moving to dead letter queue`);
			await this.moveToDeadLetterQueue(event, error);
		}

		// Update metrics
		await this.updateQueueMetrics('failed', event.eventType);
	}

	/**
	 * Move failed event to dead letter queue
	 */
	private async moveToDeadLetterQueue(event: WebhookEvent, error: Error): Promise<void> {
		const deadLetterEvent = {
			...event,
			failedAt: new Date().toISOString(),
			error: {
				message: error.message,
				stack: error.stack,
				name: error.name,
			},
		};

		try {
			await this.client.rPush(QUEUE_CONFIG.deadLetterQueue, JSON.stringify(deadLetterEvent));
			LogEngine.info(`Moved event ${event.eventId} to dead letter queue`);
		}
		catch (dlqError) {
			LogEngine.error(`Failed to move event ${event.eventId} to dead letter queue:`, dlqError);
		}
	}

	/**
	 * Remove event from processing queue
	 */
	private async removeFromProcessingQueue(eventId: string): Promise<void> {
		try {
			const processingItems = await this.client.lRange(QUEUE_CONFIG.processingQueue, 0, -1);

			for (let i = 0; i < processingItems.length; i++) {
				const item = JSON.parse(processingItems[i]) as WebhookEvent;
				if (item.eventId === eventId) {
					// Remove by index (Redis LREM could work too but this is more precise)
					await this.client.lSet(QUEUE_CONFIG.processingQueue, i, 'DELETE_MARKER');
					await this.client.lRem(QUEUE_CONFIG.processingQueue, 1, 'DELETE_MARKER');
					break;
				}
			}
		}
		catch (error) {
			LogEngine.error(`Failed to remove event ${eventId} from processing queue:`, error);
		}
	}

	/**
	 * Check for duplicate events
	 */
	private async checkDuplicateEvent(event: WebhookEvent): Promise<boolean> {
		const dedupeKey = this.generateDeduplicationKey(event);
		const exists = await this.client.exists(dedupeKey);
		return exists === 1;
	}

	/**
	 * Store deduplication key
	 */
	private async storeDuplicationKey(event: WebhookEvent): Promise<void> {
		const dedupeKey = this.generateDeduplicationKey(event);
		await this.client.setEx(dedupeKey, QUEUE_CONFIG.deduplicationTTL, event.eventId);
	}

	/**
	 * Generate deduplication key for event
	 */
	private generateDeduplicationKey(event: WebhookEvent): string {
		// Create a key based on event content to detect duplicates
		const keyData = {
			type: event.eventType,
			source: event.sourcePlatform,
			target: event.targetPlatform,
			content: event.data.content?.substring(0, 100), // First 100 chars
			conversationId: event.data.conversationId,
			messageId: event.data.messageId,
		};

		const keyString = JSON.stringify(keyData);
		return `${QUEUE_CONFIG.deduplicationKeyPrefix}${Buffer.from(keyString).toString('base64')}`;
	}

	/**
	 * Update queue metrics
	 */
	private async updateQueueMetrics(
		operation: 'queued' | 'processed' | 'failed',
		eventType: string,
		processingTime?: number,
	): Promise<void> {
		try {
			const timestamp = Date.now();
			const metricsKey = `metrics:queue:${operation}:${eventType}`;

			// Increment counter
			await this.client.incr(metricsKey);
			await this.client.expire(metricsKey, QUEUE_CONFIG.metricsRetention);

			// Store processing time if provided
			if (processingTime !== undefined) {
				const timeKey = `metrics:processing_time:${eventType}`;
				await this.client.lPush(timeKey, `${timestamp}:${processingTime}`);
				await this.client.lTrim(timeKey, 0, 999); // Keep last 1000 measurements
				await this.client.expire(timeKey, QUEUE_CONFIG.metricsRetention);
			}

		}
		catch (error) {
			// Don't let metrics failures affect main processing
			LogEngine.error('Failed to update queue metrics:', error);
		}
	}

	/**
	 * Start queue processing
	 */
	async startProcessing(): Promise<void> {
		this.processingActive = true;
		LogEngine.info('Queue processing started');
	}

	/**
	 * Stop queue processing
	 */
	async stopProcessing(): Promise<void> {
		this.processingActive = false;

		// Wait for all processors to finish
		await Promise.all(this.processors.values());

		LogEngine.info('Queue processing stopped');
	}

	/**
	 * Get queue status and metrics
	 */
	async getQueueStatus(): Promise<{
		isConnected: boolean;
		queueSizes: Record<string, number>;
		activeProcessors: number;
		isProcessing: boolean;
	}> {
		const queueSizes: Record<string, number> = {};

		try {
			queueSizes[QUEUE_CONFIG.webhookQueue] = await this.client.lLen(QUEUE_CONFIG.webhookQueue);
			queueSizes[QUEUE_CONFIG.deadLetterQueue] = await this.client.lLen(QUEUE_CONFIG.deadLetterQueue);
			queueSizes[QUEUE_CONFIG.processingQueue] = await this.client.lLen(QUEUE_CONFIG.processingQueue);
		}
		catch (error) {
			LogEngine.error('Failed to get queue sizes:', error);
		}

		return {
			isConnected: this.isConnected,
			queueSizes,
			activeProcessors: this.processors.size,
			isProcessing: this.processingActive,
		};
	}

	/**
	 * Close Redis connection
	 */
	async close(): Promise<void> {
		await this.stopProcessing();
		await this.client.quit();
		this.isConnected = false;
		LogEngine.info('Redis queue manager closed');
	}
}