/**
 * Queue-Based Webhook Processing System
 *
 * This module implements a robust queue-based system for processing webhook events
 * from Unthread, replacing the direct synchronous processing approach with an
 * asynchronous, scalable, and fault-tolerant solution.
 *
 * Features:
 * - Redis-backed job queue with BullMQ
 * - Automatic retry logic with exponential backoff
 * - Job priority and rate limiting
 * - Dead letter queue for failed jobs
 * - Comprehensive monitoring and metrics
 * - Graceful shutdown handling
 *
 * Queue Types:
 * - webhook-events: Primary queue for incoming webhook events
 * - webhook-dlq: Dead letter queue for permanently failed jobs
 * - webhook-priority: High-priority events (urgent tickets, etc.)
 *
 * @module services/QueueProcessor
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { LogEngine } from '../config/logger';
import { WebhookPayload } from '../types/unthread';
import { handleWebhookEvent as unthreadWebhookHandler } from './unthread';

/**
 * Job data structure for webhook processing
 */
interface WebhookJobData {
    payload: WebhookPayload;
    eventType: string;
    receivedAt: Date;
    priority?: number;
    source: 'webhook' | 'retry' | 'manual';
}

/**
 * Extended job data for DLQ
 */
interface DLQJobData extends WebhookJobData {
    errorMessage?: string;
    failedAt?: Date;
    originalQueue?: string;
}

/**
 * Queue configuration
 */
interface QueueConfig {
    redisUrl: string;
    concurrency: number;
    maxRetries: number;
    retryDelayMs: number;
    rateLimitMax: number;
    rateLimitDuration: number;
    enableMetrics: boolean;
}

/**
 * Queue metrics
 */
interface QueueMetrics {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    activeJobs: number;
    waitingJobs: number;
    delayedJobs: number;
    processingTime: number;
    errorRate: number;
}

/**
 * Main Queue Processor class
 */
export class QueueProcessor {
	private static instance: QueueProcessor;
	private config: QueueConfig;
	private redis: Redis;

	// Queues
	private webhookQueue!: Queue<WebhookJobData>;
	private priorityQueue!: Queue<WebhookJobData>;
	private dlqQueue!: Queue<DLQJobData>;

	// Workers
	private webhookWorker!: Worker<WebhookJobData>;
	private priorityWorker!: Worker<WebhookJobData>;

	// Events
	private queueEvents!: QueueEvents;

	// Metrics
	private metrics: Map<string, number> = new Map();
	private isShuttingDown = false;

	private constructor(config: QueueConfig) {
		this.config = config;
		this.redis = new Redis(config.redisUrl);
		this.initializeQueues();
		this.initializeWorkers();
		this.initializeEvents();
		this.setupShutdownHandlers();

		LogEngine.info('QueueProcessor initialized with BullMQ backend');
	}

	/**
     * Get or create singleton instance
     */
	public static getInstance(config?: QueueConfig): QueueProcessor {
		if (!QueueProcessor.instance) {
			if (!config) {
				throw new Error('QueueProcessor config required for first initialization');
			}
			QueueProcessor.instance = new QueueProcessor(config);
		}
		return QueueProcessor.instance;
	}

	/**
	 * Validate required environment variables for QueueProcessor
	 */
	private static validateEnvironmentVariables(): void {
		const requiredVars = [
			{ name: 'WEBHOOK_REDIS_URL', description: 'Redis connection string for webhook processing queue' },
		];

		const missingVars: string[] = [];

		for (const { name, description } of requiredVars) {
			// Safe access since name comes from controlled requiredVars array
			if (!process.env[name as keyof NodeJS.ProcessEnv]) {
				missingVars.push(`${name} (${description})`);
			}
		}

		if (missingVars.length > 0) {
			const errorMessage = [
				'QueueProcessor initialization failed: Missing required environment variables',
				'',
				'Required variables:',
				...missingVars.map(variable => `  - ${variable}`),
				'',
				'Please set these variables in your .env file or environment.',
			].join('\n');

			throw new Error(errorMessage);
		}
	}

	/**
	 * Create configuration from validated environment variables
	 */
	private static createConfigFromEnvironment(): QueueConfig {
		return {
			// Hard-coded queue configuration as per requirements
			redisUrl: process.env.WEBHOOK_REDIS_URL!,
			concurrency: 5,
			maxRetries: 3,
			retryDelayMs: 5000,
			rateLimitMax: 100,
			rateLimitDuration: 60000,
			enableMetrics: process.env.DEBUG_MODE === 'true',
		};
	}

	/**
	 * Initialize with environment configuration
	 */
	public static async initialize(): Promise<QueueProcessor> {
		// Validate required environment variables
		this.validateEnvironmentVariables();

		// Create configuration from validated environment
		const config = this.createConfigFromEnvironment();

		// Initialize and return instance
		const processor = QueueProcessor.getInstance(config);
		await processor.start();
		return processor;
	}

	private initializeQueues(): void {
		const defaultOptions = {
			connection: this.redis,
			defaultJobOptions: {
				removeOnComplete: 100,
				removeOnFail: 50,
				attempts: this.config.maxRetries,
				backoff: {
					type: 'exponential',
					delay: this.config.retryDelayMs,
				},
			},
		};

		this.webhookQueue = new Queue('webhook-events', defaultOptions);
		this.priorityQueue = new Queue('webhook-priority', defaultOptions);
		this.dlqQueue = new Queue<DLQJobData>('webhook-dlq', {
			connection: this.redis,
			defaultJobOptions: {
				removeOnComplete: 1000,
				removeOnFail: 1000,
				// No retries for DLQ
				attempts: 1,
			},
		});

		LogEngine.info('Webhook processing queues initialized');
	}

	private initializeWorkers(): void {
		// Main webhook worker
		this.webhookWorker = new Worker<WebhookJobData>(
			'webhook-events',
			async (job) => this.processWebhookJob(job),
			{
				connection: this.redis,
				concurrency: this.config.concurrency,
				limiter: {
					max: this.config.rateLimitMax,
					duration: this.config.rateLimitDuration,
				},
			},
		);

		// Priority webhook worker (higher concurrency)
		this.priorityWorker = new Worker<WebhookJobData>(
			'webhook-priority',
			async (job) => this.processWebhookJob(job),
			{
				connection: this.redis,
				concurrency: this.config.concurrency * 2,
			},
		);

		LogEngine.info('Webhook processing workers initialized');
	}

	private initializeEvents(): void {
		this.queueEvents = new QueueEvents('webhook-events', { connection: this.redis });

		// Job completion events
		this.queueEvents.on('completed', ({ jobId }) => {
			this.updateMetrics('completed');
			LogEngine.debug(`Webhook job completed: ${jobId}`);
		});

		this.queueEvents.on('failed', ({ jobId, failedReason }) => {
			this.updateMetrics('failed');
			LogEngine.error(`Webhook job failed: ${jobId} - ${failedReason}`);
		});

		this.queueEvents.on('stalled', ({ jobId }) => {
			this.updateMetrics('stalled');
			LogEngine.warn(`Webhook job stalled: ${jobId}`);
		});

		// Worker events
		this.webhookWorker.on('completed', (job) => {
			LogEngine.debug(`Webhook processed successfully: ${job.data.eventType}`);
		});

		this.webhookWorker.on('failed', (job, err) => {
			LogEngine.error(`Webhook processing failed: ${job?.data.eventType} - ${err.message}`);
		});

		LogEngine.info('Queue event handlers initialized');
	}

	private setupShutdownHandlers(): void {
		const shutdown = async () => {
			if (this.isShuttingDown) return;
			this.isShuttingDown = true;

			LogEngine.info('Shutting down queue processor...');

			try {
				await Promise.all([
					this.webhookWorker.close(),
					this.priorityWorker.close(),
					this.queueEvents.close(),
				]);

				await this.redis.disconnect();
				LogEngine.info('Queue processor shutdown completed');
			}
			catch (error) {
				LogEngine.error('Error during queue processor shutdown:', error);
			}
		};

		process.on('SIGTERM', shutdown);
		process.on('SIGINT', shutdown);
	}

	/**
     * Start the queue processor
     */
	async start(): Promise<void> {
		try {
			// IORedis connects automatically when needed
			await this.redis.ping();
			LogEngine.info('Queue processor started successfully');
		}
		catch (error) {
			LogEngine.error('Failed to start queue processor:', error);
			throw error;
		}
	}

	/**
     * Add webhook event to processing queue
     */
	async addWebhookEvent(
		payload: WebhookPayload,
		options: {
            priority?: 'low' | 'normal' | 'high';
            delay?: number;
            source?: 'webhook' | 'retry' | 'manual';
        } = {},
	): Promise<string> {
		const jobData: WebhookJobData = {
			payload,
			eventType: payload.event,
			receivedAt: new Date(),
			source: options.source || 'webhook',
		};

		try {
			let job;
			
			// BullMQ retry configuration
			const retryOptions = {
				attempts: this.config.maxRetries,
				backoff: {
					type: 'exponential' as const,
					delay: this.config.retryDelayMs,
				},
			};

			if (options.priority === 'high') {
				job = await this.priorityQueue.add('webhook-event', jobData, {
					priority: 10,
					...retryOptions,
					...(options.delay && { delay: options.delay }),
				});
			}
			else {
				const priority = options.priority === 'low' ? 1 : 5;
				job = await this.webhookQueue.add('webhook-event', jobData, {
					priority,
					...retryOptions,
					...(options.delay && { delay: options.delay }),
				});
			}

			this.updateMetrics('queued');
			LogEngine.debug(`Webhook event queued: ${payload.event} (Job ID: ${job.id})`);
			return job.id || 'unknown';

		}
		catch (error) {
			LogEngine.error('Failed to queue webhook event:', error);
			throw error;
		}
	}

	/**
     * Process individual webhook job
     * 
     * BullMQ expects thrown errors for retry logic to work properly.
     * This method now throws errors for retryable failures instead of returning failure objects.
     */
	private async processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
		const startTime = Date.now();
		const { payload, eventType } = job.data;

		try {
			LogEngine.debug(`Processing webhook job: ${eventType} (Attempt: ${job.attemptsMade + 1})`);

			// Call the original webhook handler
			await unthreadWebhookHandler(payload);

			const duration = Date.now() - startTime;
			this.updateMetrics('processing_time', duration);

			LogEngine.debug(`Webhook job completed successfully: ${eventType} (${duration}ms)`);

		}
		catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			LogEngine.error(`Webhook processing error: ${errorMessage} (Attempt: ${job.attemptsMade + 1})`);

			// Determine if error is retryable
			const retryable = this.isRetryableError(error);

			if (!retryable || job.attemptsMade >= this.config.maxRetries - 1) {
				// Send to dead letter queue for non-retryable errors or max retries reached
				await this.sendToDLQ(job.data, errorMessage);
				LogEngine.error(`Job moved to DLQ: ${eventType} - ${errorMessage}`);
			}

			// Always throw for BullMQ retry mechanism to work
			// BullMQ will handle the retry logic based on job configuration
			throw error;
		}
	}

	/**
     * Send failed job to dead letter queue
     */
	private async sendToDLQ(jobData: WebhookJobData, error: string): Promise<void> {
		try {
			await this.dlqQueue.add('failed-webhook', {
				...jobData,
				failedAt: new Date(),
				originalQueue: 'webhook-events',
				errorMessage: error,
			});

			LogEngine.warn(`Webhook job sent to DLQ: ${jobData.eventType} - ${error}`);
		}
		catch (dlqError) {
			LogEngine.error('Failed to send job to DLQ:', dlqError);
		}
	}

	/**
     * Determine if an error is retryable
     */
	private isRetryableError(error: unknown): boolean {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();

			// Non-retryable errors
			if (message.includes('validation') ||
                message.includes('authentication') ||
                message.includes('authorization') ||
                message.includes('not found') ||
                message.includes('bad request')) {
				return false;
			}

			// Retryable errors (network, temporary issues)
			if (message.includes('timeout') ||
                message.includes('connection') ||
                message.includes('service unavailable') ||
                message.includes('rate limit')) {
				return true;
			}
		}

		// Default to retryable for unknown errors
		return true;
	}

	/**
     * Get queue metrics
     */
	async getMetrics(): Promise<QueueMetrics> {
		const [webhookCounts, priorityCounts] = await Promise.all([
			this.webhookQueue.getJobCounts(),
			this.priorityQueue.getJobCounts(),
		]);

		const totalJobs = this.metrics.get('queued') || 0;
		const completedJobs = this.metrics.get('completed') || 0;
		const failedJobs = this.metrics.get('failed') || 0;
		const processingTimeTotal = this.metrics.get('processing_time') || 0;

		return {
			totalJobs,
			completedJobs,
			failedJobs,
			activeJobs: webhookCounts.active + priorityCounts.active,
			waitingJobs: webhookCounts.waiting + priorityCounts.waiting,
			delayedJobs: webhookCounts.delayed + priorityCounts.delayed,
			processingTime: completedJobs > 0 ? processingTimeTotal / completedJobs : 0,
			errorRate: totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0,
		};
	}

	/**
     * Get health status
     */
	async getHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        queues: Record<string, boolean>;
        workers: Record<string, boolean>;
        redis: boolean;
    }> {
		try {
			await this.redis.ping();
			const redisHealthy = true;

			const queueHealth = {
				webhook: await this.webhookQueue.isPaused() === false,
				priority: await this.priorityQueue.isPaused() === false,
				dlq: await this.dlqQueue.isPaused() === false,
			};

			const workerHealth = {
				webhook: !this.webhookWorker.closing,
				priority: !this.priorityWorker.closing,
			};

			const allHealthy = redisHealthy &&
                Object.values(queueHealth).every(h => h) &&
                Object.values(workerHealth).every(h => h);

			return {
				status: allHealthy ? 'healthy' : 'degraded',
				queues: queueHealth,
				workers: workerHealth,
				redis: redisHealthy,
			};

		}
		catch (error) {
			LogEngine.error('Queue health check failed:', error);
			return {
				status: 'unhealthy',
				queues: { webhook: false, priority: false, dlq: false },
				workers: { webhook: false, priority: false },
				redis: false,
			};
		}
	}

	/**
     * Retry failed jobs from DLQ
     * 
     * Fixed to query correct job states ('failed' instead of 'completed')
     * and use proper error field access.
     */
	async retryFailedJobs(limit: number = 10): Promise<number> {
		try {
			// Query 'failed' and 'waiting' jobs instead of 'completed'
			const failedJobs = await this.dlqQueue.getJobs(['failed', 'waiting'], 0, limit - 1);
			let retriedCount = 0;

			for (const job of failedJobs) {
				const originalData = job.data as WebhookJobData;
				
				// Get error message from job's failed reason or generic message
				const errorMessage = job.failedReason || 'Unknown error';

				// Create retry data without custom retryCount (using BullMQ's built-in retry)
				const retryData: WebhookJobData = {
					payload: originalData.payload,
					eventType: originalData.eventType,
					receivedAt: new Date(),
					source: 'retry',
				};

				LogEngine.debug(`Retrying failed job: ${originalData.eventType} - ${errorMessage}`);
				
				await this.addWebhookEvent(retryData.payload, { source: 'retry' });
				await job.remove();
				retriedCount++;
			}

			LogEngine.info(`Retried ${retriedCount} failed webhook jobs`);
			return retriedCount;

		}
		catch (error) {
			LogEngine.error('Failed to retry jobs from DLQ:', error);
			return 0;
		}
	}

	private updateMetrics(metric: string, value: number = 1): void {
		if (!this.config.enableMetrics) return;

		const current = this.metrics.get(metric) || 0;
		this.metrics.set(metric, current + value);
	}
}