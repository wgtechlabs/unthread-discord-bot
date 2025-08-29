/**
 * Channel Utilities
 *
 * This module provides utility functions for validating Discord channel types
 * and ensuring proper channel handling throughout the application.
 *
 * @module utils/channelUtils
 */

import { LogEngine } from '../config/logger';
import { ChannelType } from 'discord.js';
import '../types/global';


/**
 * Checks if a channel is actually a forum channel
 *
 * @param channelId - The Discord channel ID to check
 * @returns True if the channel is a forum channel, false otherwise
 * @throws Never throws - errors are logged and false is returned
 *
 * @example
 * ```typescript
 * const isValidForum = await isForumChannel('123456789');
 * if (isValidForum) {
 *   console.log('Channel is a valid forum');
 * }
 * ```
 */
async function isForumChannel(channelId: string): Promise<boolean> {
	try {
		if (!global.discordClient) {
			LogEngine.warn('Discord client not available for channel type validation');
			return false;
		}

		const channel = await global.discordClient.channels.fetch(channelId) as { type: ChannelType } | null;
		if (!channel) {
			LogEngine.warn(`Channel ${channelId} not found`);
			return false;
		}

		return channel.type === ChannelType.GuildForum;
	}
	catch (error) {
		LogEngine.error(`Error checking channel type for ${channelId}:`, error);
		return false;
	}
}

/**
 * Validates and filters forum channel IDs from environment variable
 * Only returns IDs that are actually forum channels
 *
 * @param forumChannelIds - Comma-separated list of channel IDs
 * @returns Array of validated forum channel IDs
 * @throws Never throws - invalid channels are logged and filtered out
 *
 * @example
 * ```typescript
 * const validChannels = await validateForumChannelIds('123,456,789');
 * console.log(`Found ${validChannels.length} valid forum channels`);
 * ```
 */
async function validateForumChannelIds(forumChannelIds: string): Promise<string[]> {
	if (!forumChannelIds) {
		return [];
	}

	const channelIds = forumChannelIds.split(',').map(id => id.trim()).filter(id => id);
	const validForumChannels: string[] = [];

	for (const channelId of channelIds) {
		const isValid = await isForumChannel(channelId);
		if (isValid) {
			validForumChannels.push(channelId);
			LogEngine.debug(`Validated forum channel: ${channelId}`);
		}
		else {
			LogEngine.warn(`Channel ${channelId} in FORUM_CHANNEL_IDS is not a forum channel - skipping`);
		}
	}

	return validForumChannels;
}

/**
 * Gets the validated forum channel IDs with caching
 *
 * This prevents repeated validation calls by caching results for 5 minutes.
 * Automatically validates channels from FORUM_CHANNEL_IDS environment variable.
 *
 * @returns Array of validated forum channel IDs
 * @throws Never throws - returns empty array if validation fails
 *
 * @example
 * ```typescript
 * const validChannels = await getValidatedForumChannelIds();
 * if (validChannels.length > 0) {
 *   console.log('Forum channels are configured');
 * }
 * ```
 */
let cachedForumChannelIds: string[] | null = null;
let lastValidationTime = 0;
// 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

async function getValidatedForumChannelIds(): Promise<string[]> {
	const now = Date.now();

	// Return cached result if still valid
	if (cachedForumChannelIds && (now - lastValidationTime) < CACHE_DURATION) {
		return cachedForumChannelIds;
	}

	// Validate and cache
	const forumChannelIds = process.env.FORUM_CHANNEL_IDS || '';
	cachedForumChannelIds = await validateForumChannelIds(forumChannelIds);
	lastValidationTime = now;

	LogEngine.info(`Validated ${cachedForumChannelIds.length} forum channels from FORUM_CHANNEL_IDS`);

	return cachedForumChannelIds;
}

/**
 * Checks if a given channel ID is in the validated forum channels list
 *
 * @param channelId - The channel ID to check
 * @returns True if the channel is a validated forum channel
 * @throws Never throws - returns false if validation fails
 *
 * @example
 * ```typescript
 * const isValidForum = await isValidatedForumChannel('123456789');
 * if (isValidForum) {
 *   console.log('Channel is in validated forum list');
 * }
 * ```
 */
async function isValidatedForumChannel(channelId: string): Promise<boolean> {
	const validForumChannels = await getValidatedForumChannelIds();
	return validForumChannels.includes(channelId);
}

/**
 * Channel utility functions
 */
const channelUtils = {
	isForumChannel,
	validateForumChannelIds,
	getValidatedForumChannelIds,
	isValidatedForumChannel,
};

export default channelUtils;

// Export individual functions for named imports
export { isForumChannel, validateForumChannelIds, getValidatedForumChannelIds, isValidatedForumChannel };