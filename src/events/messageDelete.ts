import { Events, Message } from 'discord.js';
import { LogEngine } from '../config/logger';
import { BotsStore } from '../sdk/bots-brain/BotsStore';

/**
 * Message Delete Event Handler
 *
 * This module tracks deleted messages to support features like unthread operations
 * that may need to reference recently deleted messages. Messages are stored in
 * the memory cache with appropriate TTLs to prevent memory leaks.
 */
export const name = Events.MessageDelete;

export async function execute(message: Message): Promise<void> {
	// Ignore bot messages to avoid processing automated content
	if (message.author?.bot) return;

	try {
		// Cache the deleted message for moderation purposes using BotsStore
		const botsStore = BotsStore.getInstance();
		
		// Store individual deleted message details
		// Key format: deleted:{messageId}
		// TTL: 5 minutes (300 seconds)
		await botsStore.setBotConfig(`deleted:${message.id}`, {
			channelId: message.channel.id,
			timestamp: Date.now(),
		}, 300);

		// Track multiple deleted messages by channel for bulk operations
		// Key format: deleted:channel:{channelId}
		const channelKey = `deleted:channel:${message.channel.id}`;
		const recentlyDeletedInChannel = (await botsStore.getBotConfig<Array<Record<string, unknown>>>(channelKey)) || [];

		// Add this message to the channel's deletion history
		recentlyDeletedInChannel.push({
			messageId: message.id,
			timestamp: Date.now(),
		});

		// Keep only messages deleted in the last minute
		const oneMinuteAgo = Date.now() - 60000;
		// Keep at most 10 recent deletions
		const filteredList = recentlyDeletedInChannel
			.filter((item: Record<string, unknown>) => (item.timestamp as number) > oneMinuteAgo)
			.slice(-10);

		// Update the cache with 1 minute TTL (60 seconds)
		await botsStore.setBotConfig(channelKey, filteredList, 60);

		LogEngine.debug(`Cached deleted message ID: ${message.id} from channel: ${message.channel.id}`);
	}
	catch (error) {
		LogEngine.error('Error caching deleted message:', error);
	}
}