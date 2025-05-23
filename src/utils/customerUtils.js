/**
 * Customer Utilities Module
 * 
 * This module provides utility functions for working with customer data
 * including caching, retrieval and creation of customer records.
 * 
 * The functions handle the integration between Discord users and Unthread customers,
 * maintaining a consistent mapping between the two systems and managing
 * customer-related data persistence.
 */

const { setKey, getKey } = require('./memory');
const logger = require('./logger');
require('dotenv').config();

/**
 * Creates a new customer in Unthread's system based on Discord user information
 * 
 * This function handles the API communication with Unthread to create a customer record.
 * It's designed to be an internal function used by other utilities in this module.
 * 
 * @param {Object} user - Discord user object containing user details
 * @param {string} user.username - Username that will be used as the customer name in Unthread
 * @returns {string} - The Unthread customer ID
 * @throws {Error} - If API request fails or response is missing required fields
 * @private - This is an internal helper function
 */
async function createCustomerInUnthread(user) {
    // Construct the API request to create a customer in Unthread
    const response = await fetch('https://api.unthread.io/api/customers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.UNTHREAD_API_KEY,
        },
        body: JSON.stringify({ name: user.username }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create customer: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle API response variability - Unthread may return customerId or id
    const customerId = data.customerId || data.id;
    
    if (!customerId) {
        throw new Error(`Customer API response invalid, missing customerId: ${JSON.stringify(data)}`);
    }
    
    return customerId;
}

/**
 * Retrieves or creates a customer record for a Discord user
 * 
 * This is the main function for customer management, handling:
 * 1. Cache lookup for existing customer records
 * 2. Creation of new customer records when needed
 * 3. Proper storage of customer data with Discord and Unthread IDs
 * 
 * Use this function whenever you need to ensure a Discord user has
 * a corresponding customer record in Unthread.
 * 
 * @param {Object} user - Discord user object
 * @param {string} email - User's email address (optional)
 * @returns {Object} - Customer data object with Discord and Unthread IDs
 * @throws {Error} - If customer creation fails or invalid user is provided
 */
async function getOrCreateCustomer(user, email = '') {
    if (!user || !user.id) {
        throw new Error('Invalid user object provided to getOrCreateCustomer');
    }

    const key = `customer:${user.id}`;
    let customer = await getKey(key);
    
    if (customer) {
        logger.debug(`Found cached customer for Discord user ${user.id}`);
        return customer;
    }

    // Customer not found in cache, create a new one
    logger.debug(`Creating new customer record for Discord user ${user.id}`);
    const customerId = await createCustomerInUnthread(user);
    
    // Construct customer object with both Discord and Unthread identifiers
    customer = {
        discordId: user.id,
        discordUsername: user.username,
        discordName: user.tag || user.username,
        customerId,
        email: email || ''
    };
    
    // Store customer in cache for future lookups
    await setKey(key, customer);
    logger.info(`Created new customer record for ${user.username} (${user.id})`);
    return customer;
}

/**
 * Retrieves a customer record by Discord user ID
 * 
 * This is a lightweight lookup function that doesn't create a customer
 * if one doesn't exist. Use this when you only need to check if a 
 * customer record exists but don't want to create one.
 * 
 * @param {string} discordId - Discord user ID
 * @returns {Object|null} - Customer data object or null if not found
 */
async function getCustomerByDiscordId(discordId) {
    if (!discordId) {
        return null;
    }
    return await getKey(`customer:${discordId}`);
}

/**
 * Updates a customer record in the cache
 * 
 * Use this to update customer properties like email address
 * or any other customer-related data that changes over time.
 * 
 * Note: This only updates the local cache, not the Unthread API.
 * For Unthread API updates, additional API calls would be needed.
 * 
 * @param {Object} customer - Customer object to update
 * @returns {Object} - Updated customer object
 * @throws {Error} - If invalid customer object is provided
 */
async function updateCustomer(customer) {
    if (!customer || !customer.discordId) {
        throw new Error('Invalid customer object provided to updateCustomer');
    }
    
    const key = `customer:${customer.discordId}`;
    await setKey(key, customer);
    logger.debug(`Updated customer record for ${customer.discordUsername} (${customer.discordId})`);
    return customer;
}

module.exports = {
    getOrCreateCustomer,
    getCustomerByDiscordId,
    updateCustomer
};