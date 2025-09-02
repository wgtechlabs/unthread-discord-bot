/**
 * Customer Utilities Module - Updated for 3-Layer Architecture
 *
 * This module provides utility functions for working with customer data
 * using the new BotsStore 3-layer storage system.
 *
 * The functions handle the integration between Discord users and Unthread customers,
 * maintaining a consistent mapping between the two systems and managing
 * customer-related data persistence through the unified storage engine.
 */

import { BotsStore, Customer } from '../sdk/bots-brain/BotsStore';
import { LogEngine } from '../config/logger';
import { User } from 'discord.js';

// Re-export Customer interface for backward compatibility
export { Customer } from '../sdk/bots-brain/BotsStore';

/**
 * Creates a new customer in Unthread's system based on Discord user information
 *
 * This function handles the API communication with Unthread to create a customer record.
 * It's designed to be an internal function used by other utilities in this module.
 *
 * @param user - Discord user object containing user details
 * @returns The Unthread customer ID
 * @throws {Error} When UNTHREAD_API_KEY environment variable is not set
 * @throws {Error} When API request fails (4xx/5xx responses)
 * @throws {Error} When API response is missing required customerId field
 * @private
 */
async function createCustomerInUnthread(user: User): Promise<string> {
	// Validate API key exists
	const apiKey = process.env.UNTHREAD_API_KEY;
	if (!apiKey) {
		throw new Error('UNTHREAD_API_KEY environment variable is required but not set');
	}

	// Construct the API request to create a customer in Unthread
	const response = await fetch('https://api.unthread.io/api/customers', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-KEY': apiKey,
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
 * Retrieves or creates a customer record for a Discord user using BotsStore
 *
 * This is the main function for customer management, handling:
 * 1. BotsStore lookup for existing customer records (3-layer cache)
 * 2. Creation of new customer records when needed
 * 3. Proper storage of customer data with Discord and Unthread IDs
 *
 * Use this function whenever you need to ensure a Discord user has
 * a corresponding customer record in Unthread.
 *
 * @param user - Discord user object
 * @param email - User's email address (optional)
 * @returns Customer data object with Discord and Unthread IDs
 * @throws {Error} When invalid user object is provided (missing id)
 * @throws {Error} When customer creation in Unthread fails
 * @throws {Error} When storage operations fail
 *
 * @example
 * ```typescript
 * const customer = await getOrCreateCustomer(discordUser, 'user@example.com');
 * console.log(`Customer ID: ${customer.unthreadCustomerId}`);
 * ```
 */
export async function getOrCreateCustomer(user: User, email: string = ''): Promise<Customer> {
	if (!user || !user.id) {
		throw new Error('Invalid user object provided to getOrCreateCustomer');
	}

	try {
		const botsStore = BotsStore.getInstance();
		
		// Try to get existing customer from BotsStore (3-layer lookup)
		let customer = await botsStore.getCustomerByDiscordId(user.id);

		if (customer) {
			LogEngine.debug(`Found existing customer for Discord user ${user.id}`);
			return customer;
		}

		// Create new customer in Unthread if not found
		LogEngine.info(`Creating new customer for Discord user ${user.id}`);
		const unthreadCustomerId = await createCustomerInUnthread(user);

		// Store customer using BotsStore
		customer = await botsStore.storeCustomer(user, email, unthreadCustomerId);
		
		LogEngine.info(`Customer created and stored: Discord ${user.id} -> Unthread ${unthreadCustomerId}`);
		return customer;

	} catch (error) {
		LogEngine.error('Error in getOrCreateCustomer:', error);
		throw error;
	}
}

/**
 * Retrieves a customer by Discord ID using BotsStore
 *
 * This function performs a lookup in the 3-layer storage system for an existing
 * customer record based on their Discord ID.
 *
 * @param discordId - Discord user ID to look up
 * @returns Customer data object or null if not found
 * @throws {Error} When storage operations fail
 *
 * @example
 * ```typescript
 * const customer = await getCustomerByDiscordId('123456789');
 * if (customer) {
 *   console.log(`Found customer: ${customer.unthreadCustomerId}`);
 * }
 * ```
 */
export async function getCustomerByDiscordId(discordId: string): Promise<Customer | null> {
	if (!discordId) {
		throw new Error('Discord ID is required');
	}

	try {
		const botsStore = BotsStore.getInstance();
		const customer = await botsStore.getCustomerByDiscordId(discordId);
		
		if (customer) {
			LogEngine.debug(`Retrieved customer for Discord ID ${discordId}`);
		} else {
			LogEngine.debug(`No customer found for Discord ID ${discordId}`);
		}
		
		return customer;

	} catch (error) {
		LogEngine.error('Error in getCustomerByDiscordId:', error);
		throw error;
	}
}