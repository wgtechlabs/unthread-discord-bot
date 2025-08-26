/**
 * Discord Webhook Consumer
 *
 * Processes webhook events from the Redis queue and handles them appropriately
 * for Discord integration. This includes message forwarding, file attachments,
 * and conversation management between Unthread and Discord.
 *
 * Features:
 * - Queue-based event processing
 * - Comprehensive file attachment handling
 * - Discord API integration
 * - Error handling and retry logic
 * - Event type routing and processing
 *
 * @module services/consumer
 */

import { Client, EmbedBuilder, ThreadChannel } from 'discord.js';
import { LogEngine } from '../config/logger';
import { DiscordAttachmentHandler } from './attachments';
import { WebhookEvent, RedisQueueManager } from './queue';
import { findDiscordThreadByTicketId, findDiscordThreadByTicketIdWithRetry } from '../utils/threadUtils';
import { getTicketByUnthreadTicketId } from './unthread';
import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';
import { isDuplicateMessage, containsDiscordAttachments, processQuotedContent } from '../utils/messageUtils';
import { DISCORD_ATTACHMENT_CONFIG } from '../config/attachments';
import { version } from '../../package.json';

/**
 * Discord Webhook Consumer Class
 *
 * Consumes webhook events from Redis queue and processes them for Discord integration.
 * Handles various event types including messages, attachments, and conversation updates.
 */
export class DiscordWebhookConsumer {
	private discordClient: Client;
	private attachmentHandler: DiscordAttachmentHandler;
	private queueManager: RedisQueueManager;
	private isProcessing = false;
	private processorId: string;

	constructor(discordClient: Client, queueManager: RedisQueueManager) {
		this.discordClient = discordClient;
		this.queueManager = queueManager;
		this.attachmentHandler = new DiscordAttachmentHandler();
		this.processorId = `discord-consumer-${Date.now()}`;
	}

	/**
	 * Start consuming webhook events from the queue
	 */
	async start(): Promise<void> {
		if (this.isProcessing) {
			LogEngine.warn('Discord webhook consumer is already running');
			return;
		}

		this.isProcessing = true;
		LogEngine.info('Starting Discord webhook consumer');

		try {
			await this.queueManager.startProcessing();
			await this.queueManager.processQueueEvents(
				this.processorId,
				this.processWebhookEvent.bind(this),
			);
		}
		catch (error) {
			LogEngine.error('Error in Discord webhook consumer:', error);
			this.isProcessing = false;
			throw error;
		}
	}

	/**
	 * Stop consuming webhook events
	 */
	async stop(): Promise<void> {
		if (!this.isProcessing) {
			return;
		}

		LogEngine.info('Stopping Discord webhook consumer');
		this.isProcessing = false;
		await this.queueManager.stopProcessing();
	}

	/**
	 * Process a single webhook event from the queue
	 *
	 * @param event - Webhook event to process
	 */
	async processWebhookEvent(event: WebhookEvent): Promise<void> {
		LogEngine.info(`Processing webhook event ${event.eventId} (type: ${event.eventType})`);

		try {
			switch (event.eventType) {
			case 'message':
			case 'message_created':
				await this.handleMessage(event);
				break;
			case 'attachment':
				await this.handleAttachment(event);
				break;
			case 'conversation_updated':
				await this.handleConversationUpdate(event);
				break;
			case 'thread_create':
				await this.handleThreadCreate(event);
				break;
			default:
				LogEngine.debug(`Unhandled event type: ${event.eventType}`);
			}

			LogEngine.info(`Successfully processed webhook event ${event.eventId}`);

		}
		catch (error) {
			LogEngine.error(`Failed to process webhook event ${event.eventId}:`, error);
			throw error; // Re-throw to trigger retry logic
		}
	}

	/**
	 * Handle message events from Unthread
	 *
	 * @param event - Message webhook event
	 */
	private async handleMessage(event: WebhookEvent): Promise<void> {
		const { data } = event;

		// Extract conversation and message data
		const conversationId = data.conversationId || data.conversation?.id;
		const message = data.message;

		if (!conversationId || !message) {
			LogEngine.warn(`Message event ${event.eventId} missing required data`);
			return;
		}

		try {
			// Find Discord thread with retry logic for new conversations
			const { discordThread } = await findDiscordThreadByTicketIdWithRetry(
				conversationId,
				getTicketByUnthreadTicketId,
				{
					maxAttempts: 5,
					maxRetryWindow: 30000,
					baseDelayMs: 2000,
				},
			);

			if (!discordThread) {
				LogEngine.debug(`No Discord thread found for conversation ${conversationId} - this is normal for conversations not created via Discord`);
				return;
			}

			// Process and clean message content
			let messageContent = message.markdown || '';
			messageContent = decodeHtmlEntities(messageContent);

			// Process quoted content if any
			const { contentToSend, isDuplicate } = processQuotedContent(messageContent, []);

			if (isDuplicate) {
				LogEngine.debug(`Skipping duplicate message in conversation ${conversationId}`);
				return;
			}

			// Skip messages with Discord attachments to avoid duplication
			if (containsDiscordAttachments(contentToSend)) {
				LogEngine.debug(`Skipping message with Discord attachments in conversation ${conversationId}`);
				return;
			}

			// Check for duplicate messages
			if (await isDuplicateMessage(discordThread.id, contentToSend)) {
				LogEngine.debug(`Skipping duplicate message in thread ${discordThread.id}`);
				return;
			}

			// Send message to Discord if content exists
			if (contentToSend.trim()) {
				await this.sendMessageToDiscord(discordThread, contentToSend, message);
			}

		}
		catch (error) {
			if (error instanceof Error && error.message.includes('No Discord thread found')) {
				LogEngine.debug(`Thread mapping not found for conversation ${conversationId} - this is normal for conversations not created via Discord`);
			}
			else {
				LogEngine.error(`Error handling message for conversation ${conversationId}:`, error);
				throw error;
			}
		}
	}

	/**
	 * Handle file attachment events
	 *
	 * @param event - Attachment webhook event
	 */
	private async handleAttachment(event: WebhookEvent): Promise<void> {
		const { data } = event;

		if (!data.files || data.files.length === 0) {
			LogEngine.debug(`Attachment event ${event.eventId} has no files to process`);
			return;
		}

		if (!data.channelId) {
			LogEngine.error(`Attachment event ${event.eventId} missing channelId`);
			return;
		}

		try {
			LogEngine.info(`Processing ${data.files.length} file attachments for channel ${data.channelId}`);

			// Extract file URLs from the file data
			const fileUrls = data.files
				.map(file => file.url)
				.filter((url): url is string => Boolean(url));

			if (fileUrls.length === 0) {
				LogEngine.warn(`No valid file URLs found in attachment event ${event.eventId}`);
				return;
			}

			// Process files through attachment handler
			const result = await this.attachmentHandler.processBufferAttachments(
				fileUrls,
				data.channelId,
				data.content,
			);

			if (result.success) {
				LogEngine.info(`Successfully processed ${result.processedCount} attachments for event ${event.eventId}`);
			}
			else {
				LogEngine.error(`Attachment processing failed for event ${event.eventId}:`, result.errors);

				// If there are validation errors but some files processed, log details
				if (result.processedCount > 0) {
					LogEngine.info(`Partial success: ${result.processedCount}/${data.files.length} files processed`);
				}
			}

		}
		catch (error) {
			LogEngine.error(`Error processing attachments for event ${event.eventId}:`, error);
			throw error;
		}
	}

	/**
	 * Handle conversation update events (status changes, etc.)
	 *
	 * @param event - Conversation update event
	 */
	private async handleConversationUpdate(event: WebhookEvent): Promise<void> {
		const { data } = event;
		const conversation = data.conversation;

		if (!conversation) {
			LogEngine.warn(`Conversation update event ${event.eventId} missing conversation data`);
			return;
		}

		try {
			const { discordThread } = await findDiscordThreadByTicketId(
				conversation.id,
				getTicketByUnthreadTicketId,
			);

			if (!discordThread) {
				LogEngine.debug(`No Discord thread found for conversation ${conversation.id}`);
				return;
			}

			// Handle different types of conversation updates
			await this.handleConversationStatusUpdate(discordThread, conversation);

		}
		catch (error) {
			if (error instanceof Error && error.message.includes('No Discord thread found')) {
				LogEngine.debug(`Thread mapping not found for conversation ${conversation.id} - this is normal for conversations not created via Discord`);
			}
			else {
				LogEngine.error(`Error handling conversation update for ${conversation.id}:`, error);
				throw error;
			}
		}
	}

	/**
	 * Handle thread creation events
	 *
	 * @param event - Thread creation event
	 */
	private async handleThreadCreate(event: WebhookEvent): Promise<void> {
		LogEngine.debug(`Thread creation event ${event.eventId} received - no specific action needed`);
		// Thread creation is typically handled during ticket creation
		// This event type is mainly for logging and monitoring purposes
	}

	/**
	 * Send a message to Discord with proper formatting
	 *
	 * @param thread - Discord thread to send to
	 * @param content - Message content
	 * @param messageData - Original message data from Unthread
	 */
	private async sendMessageToDiscord(
		thread: ThreadChannel,
		content: string,
		messageData: { authorName?: string; authorEmail?: string; createdAt?: string },
	): Promise<void> {
		try {
			// Create embed for the message
			const embed = new EmbedBuilder()
				.setColor(DISCORD_ATTACHMENT_CONFIG.embedColor)
				.setAuthor({
					name: messageData.authorName || 'Support Team',
					iconURL: 'https://cdn.unthread.io/assets/logo-32.png',
				})
				.setDescription(content)
				.setFooter({ text: `Unthread Discord Bot v${version}` });

			// Add timestamp if available
			if (messageData.createdAt) {
				embed.setTimestamp(new Date(messageData.createdAt));
			}
			else {
				embed.setTimestamp();
			}

			await thread.send({ embeds: [embed] });
			LogEngine.info(`Sent message to Discord thread ${thread.id}`);

		}
		catch (error) {
			LogEngine.error(`Failed to send message to Discord thread ${thread.id}:`, error);
			throw error;
		}
	}

	/**
	 * Handle conversation status updates
	 *
	 * @param thread - Discord thread
	 * @param conversation - Conversation data
	 */
	private async handleConversationStatusUpdate(
		thread: ThreadChannel,
		conversation: { id: string; friendlyId?: string; title?: string; status: string },
	): Promise<void> {
		try {
			// Determine embed color based on status
			const statusColor = conversation.status === 'closed' ? 0xFF0000 :
				conversation.status === 'resolved' ? 0x00FF00 :
					conversation.status === 'open' ? 0xFFFF00 : DISCORD_ATTACHMENT_CONFIG.embedColor;

			// Create status update embed
			const embed = new EmbedBuilder()
				.setColor(statusColor)
				.setTitle('🎫 Ticket Status Updated')
				.addFields(
					{ name: 'Ticket ID', value: `#${conversation.friendlyId || conversation.id}`, inline: true },
					{ name: 'Status', value: conversation.status.toUpperCase(), inline: true },
				)
				.setFooter({ text: `Unthread Discord Bot v${version}` })
				.setTimestamp();

			// Add title if available
			if (conversation.title) {
				embed.addFields({ name: 'Title', value: conversation.title, inline: false });
			}

			await thread.send({ embeds: [embed] });

			// Handle thread archival for closed/resolved tickets
			if (conversation.status === 'closed' || conversation.status === 'resolved') {
				try {
					await thread.setArchived(true);
					LogEngine.info(`Archived Discord thread ${thread.id} for ${conversation.status} ticket`);
				}
				catch (archiveError) {
					LogEngine.warn(`Failed to archive Discord thread ${thread.id}:`, archiveError);
				}
			}

			LogEngine.info(`Updated status for ticket ${conversation.friendlyId || conversation.id} in Discord thread ${thread.id}`);

		}
		catch (error) {
			LogEngine.error(`Failed to update status in Discord thread ${thread.id}:`, error);
			throw error;
		}
	}

	/**
	 * Get consumer status and metrics
	 */
	getStatus(): {
		isProcessing: boolean;
		processorId: string;
		startTime: string;
		} {
		return {
			isProcessing: this.isProcessing,
			processorId: this.processorId,
			startTime: new Date().toISOString(), // This would be set properly in a real implementation
		};
	}
}