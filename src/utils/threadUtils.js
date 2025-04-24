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
    findDiscordThreadByTicketId
};