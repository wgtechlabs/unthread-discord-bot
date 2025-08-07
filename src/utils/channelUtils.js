/**
 * Channel Utilities
 * 
 * This module provides utility functions for validating Discord channel types
 * and ensuring proper channel handling throughout the application.
 */

const { ChannelType } = require('discord.js');
const logger = require('./logger');

/**
 * Checks if a channel is actually a forum channel
 * 
 * @param {string} channelId - The Discord channel ID to check
 * @returns {Promise<boolean>} - True if the channel is a forum channel, false otherwise
 */
async function isForumChannel(channelId) {
    try {
        if (!global.discordClient) {
            logger.warn('Discord client not available for channel type validation');
            return false;
        }

        const channel = await global.discordClient.channels.fetch(channelId);
        if (!channel) {
            logger.warn(`Channel ${channelId} not found`);
            return false;
        }

        return channel.type === ChannelType.GuildForum;
    } catch (error) {
        logger.error(`Error checking channel type for ${channelId}:`, error);
        return false;
    }
}

/**
 * Validates and filters forum channel IDs from environment variable
 * Only returns IDs that are actually forum channels
 * 
 * @param {string} forumChannelIds - Comma-separated list of channel IDs
 * @returns {Promise<string[]>} - Array of validated forum channel IDs
 */
async function validateForumChannelIds(forumChannelIds) {
    if (!forumChannelIds) {
        return [];
    }

    const channelIds = forumChannelIds.split(',').map(id => id.trim()).filter(id => id);
    const validForumChannels = [];

    for (const channelId of channelIds) {
        const isValid = await isForumChannel(channelId);
        if (isValid) {
            validForumChannels.push(channelId);
            logger.debug(`Validated forum channel: ${channelId}`);
        } else {
            logger.warn(`Channel ${channelId} in FORUM_CHANNEL_IDS is not a forum channel - skipping`);
        }
    }

    return validForumChannels;
}

/**
 * Gets the validated forum channel IDs with caching
 * This prevents repeated validation calls
 */
let cachedForumChannelIds = null;
let lastValidationTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getValidatedForumChannelIds() {
    const now = Date.now();
    
    // Return cached result if still valid
    if (cachedForumChannelIds && (now - lastValidationTime) < CACHE_DURATION) {
        return cachedForumChannelIds;
    }

    // Validate and cache
    const forumChannelIds = process.env.FORUM_CHANNEL_IDS;
    cachedForumChannelIds = await validateForumChannelIds(forumChannelIds);
    lastValidationTime = now;

    logger.info(`Validated ${cachedForumChannelIds.length} forum channels from FORUM_CHANNEL_IDS`);
    
    return cachedForumChannelIds;
}

/**
 * Checks if a given channel ID is in the validated forum channels list
 * 
 * @param {string} channelId - The channel ID to check
 * @returns {Promise<boolean>} - True if the channel is a validated forum channel
 */
async function isValidatedForumChannel(channelId) {
    const validForumChannels = await getValidatedForumChannelIds();
    return validForumChannels.includes(channelId);
}

module.exports = {
    isForumChannel,
    validateForumChannelIds,
    getValidatedForumChannelIds,
    isValidatedForumChannel
};
