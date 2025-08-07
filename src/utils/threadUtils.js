/**
 * Thread Utilities Module
 * 
 * This module provides utility functions for working with Discord threads
 * and mapping them to Unthread tickets. The utilities consolidate common
 * operations like finding threads by ticket ID and error handling patterns.
 * 
 * These utilities help ensure consistent error handling and reduce code duplication
 * when performing common thread-related operations across the application.
 */

const logger = require('./logger');

/**
 * Fetches a Discord thread using an Unthread ticket ID with retry logic for race conditions
 * 
 * This function extends findDiscordThreadByTicketId with intelligent retry logic to handle
 * edge cases where webhook events arrive before ticket mappings are fully propagated in storage.
 * 
 * Common scenarios this handles:
 * - Storage propagation delays under high load
 * - Network hiccups during mapping creation
 * - Temporary storage system unavailability
 * - Webhooks arriving faster than expected from Unthread
 * 
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @param {Function} lookupFunction - Function to lookup ticket mapping by Unthread ID
 * @param {Object} options - Retry configuration options
 * @param {number} options.maxAttempts - Maximum number of retry attempts (default: 3)
 * @param {number} options.maxRetryWindow - Maximum time window for retries in ms (default: 10000)
 * @param {number} options.baseDelayMs - Base delay between retries in ms (default: 1000)
 * @returns {Promise<{ticketMapping: Object, discordThread: Object}>} - Object containing mapping and thread
 * @throws {Error} - If thread not found after all retries or other error occurs
 */
async function findDiscordThreadByTicketIdWithRetry(unthreadTicketId, lookupFunction, options = {}) {
    const {
        maxAttempts = 3,
        maxRetryWindow = 10000, // 10 seconds
        baseDelayMs = 1000 // 1 second
    } = options;
    
    const startTime = Date.now();
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Try the standard lookup
            return await findDiscordThreadByTicketId(unthreadTicketId, lookupFunction);
        } catch (error) {
            lastError = error;
            const timeSinceStart = Date.now() - startTime;
            
            // Only retry if:
            // 1. This is not the last attempt
            // 2. We're still within the retry window (for recent webhooks)
            // 3. The error is about missing mapping (not Discord API errors)
            const isLastAttempt = attempt === maxAttempts;
            const withinRetryWindow = timeSinceStart < maxRetryWindow;
            const isMappingError = error.message.includes('No Discord thread found for Unthread ticket');
            
            if (!isLastAttempt && withinRetryWindow && isMappingError) {
                const delay = baseDelayMs * attempt; // Progressive delay: 1s, 2s, 3s
                logger.debug(`Mapping not found for ticket ${unthreadTicketId}, attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms... (${timeSinceStart}ms since start)`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // If we reach here, either this is the last attempt or we shouldn't retry
            break;
        }
    }
    
    // Enhance the final error with context about the retry attempts
    if (lastError) {
        const totalTime = Date.now() - startTime;
        const enhancedError = new Error(lastError.message);
        enhancedError.context = {
            ticketId: unthreadTicketId,
            attemptsMade: maxAttempts,
            totalRetryTime: totalTime,
            likelyRaceCondition: totalTime < maxRetryWindow,
            originalError: lastError.message
        };
        
        // Log with enhanced context
        if (enhancedError.context.likelyRaceCondition) {
            logger.warn(`Potential race condition detected for ticket ${unthreadTicketId}: mapping not found after ${maxAttempts} attempts over ${totalTime}ms`);
        } else {
            logger.error(`Ticket mapping genuinely missing for ${unthreadTicketId} (checked after ${totalTime}ms)`);
        }
        
        throw enhancedError;
    }
    
    // This should never happen, but just in case
    throw new Error(`Unexpected error in retry logic for ticket ${unthreadTicketId}`);
}

/**
 * Fetches a Discord thread using an Unthread ticket ID
 * 
 * This function consolidates the common pattern of:
 * 1. Looking up a ticket mapping using an Unthread ticket ID
 * 2. Fetching the corresponding Discord thread
 * 3. Handling errors at each step with proper logging
 * 
 * Using this function ensures consistent error handling and logging
 * throughout the application when threads need to be fetched.
 * 
 * @param {string} unthreadTicketId - Unthread ticket/conversation ID
 * @param {Function} lookupFunction - Function to lookup ticket mapping by Unthread ID
 *                                   Should have signature: (id) => Promise<{discordThreadId: string}>
 * @returns {Promise<{ticketMapping: Object, discordThread: Object}>} - Object containing:
 *   - ticketMapping: The ticket mapping object with IDs for both systems
 *   - discordThread: The Discord.js thread object
 * @throws {Error} - If thread not found or other error occurs
 */
async function findDiscordThreadByTicketId(unthreadTicketId, lookupFunction) {
    // Get the ticket mapping using the provided lookup function
    // This allows the function to work with different storage mechanisms
    const ticketMapping = await lookupFunction(unthreadTicketId);
    if (!ticketMapping) {
        const error = new Error(`No Discord thread found for Unthread ticket ${unthreadTicketId}`);
        logger.error(error.message);
        throw error;
    }
    
    // Fetch the Discord thread
    try {
        const discordThread = await global.discordClient.channels.fetch(ticketMapping.discordThreadId);
        if (!discordThread) {
            const error = new Error(`Discord thread with ID ${ticketMapping.discordThreadId} not found.`);
            logger.error(error.message);
            throw error;
        }
        
        logger.debug(`Found Discord thread: ${discordThread.id}`);
        
        return {
            ticketMapping,
            discordThread
        };
    } catch (error) {
        logger.error(`Error fetching Discord thread for ticket ${unthreadTicketId}: ${error.message}`);
        throw error;
    }
}

module.exports = {
    findDiscordThreadByTicketId,
    findDiscordThreadByTicketIdWithRetry
};