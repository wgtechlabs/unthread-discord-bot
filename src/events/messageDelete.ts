import { Events, Message } from 'discord.js';
import * as logger from '../utils/logger';
import { setKey, getKey } from '../utils/memory';

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
		// Store individual deleted message details
		// Key format: deleted:{messageId}
		// TTL: 5 minutes (300000ms)
		await setKey(`deleted:${message.id}`, {
			channelId: message.channel.id,
			timestamp: Date.now(),
		}, 300000); // 5 minute TTL

		// Track multiple deleted messages by channel for bulk operations
		// Key format: deleted:channel:{channelId}
		const channelKey = `deleted:channel:${message.channel.id}`;
		const recentlyDeletedInChannel = await getKey(channelKey) || [];

		// Add this message to the channel's deletion history
		recentlyDeletedInChannel.push({
			messageId: message.id,
			timestamp: Date.now(),
		});

		// Keep only messages deleted in the last minute
		const oneMinuteAgo = Date.now() - 60000;
		const filteredList = recentlyDeletedInChannel
			.filter((item: any) => item.timestamp > oneMinuteAgo)
			.slice(-10); // Keep at most 10 recent deletions

		// Update the cache
		await setKey(channelKey, filteredList, 60000); // 1 minute TTL

		logger.debug(`Cached deleted message ID: ${message.id} from channel: ${message.channel.id}`);
	}
	catch (error) {
		logger.error('Error caching deleted message:', error);
	}
}