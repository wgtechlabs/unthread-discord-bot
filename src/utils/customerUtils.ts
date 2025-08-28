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

import { setKey, getKey } from './memory';
import { LogEngine } from '../config/logger';
import { User } from 'discord.js';

/**
 * Customer record combining Discord user data with Unthread customer information
 */
export interface Customer {
    /** Discord user ID (unique identifier in Discord) */
    discordId: string;
    /** Discord username (not display name) */
    discordUsername: string;
    /** Discord display name or username as fallback */
    discordName: string;
    /** Unthread customer ID (unique identifier in Unthread system) */
    customerId: string;
    /** Customer email address */
    email: string;
}

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
 * @param user - Discord user object
 * @param email - User's email address (optional)
 * @returns Customer data object with Discord and Unthread IDs
 * @throws {Error} When invalid user object is provided (missing id)
 * @throws {Error} When customer creation in Unthread fails
 * @throws {Error} When cache operations fail
 *
 * @example
 * ```typescript
 * const customer = await getOrCreateCustomer(discordUser, 'user@example.com');
 * console.log(`Customer ID: ${customer.customerId}`);
 * ```
 */
export async function getOrCreateCustomer(user: User, email: string = ''): Promise<Customer> {
	if (!user || !user.id) {
		throw new Error('Invalid user object provided to getOrCreateCustomer');
	}

	const key = `customer:${user.id}`;
	let customer = await getKey(key) as Customer | null;

	if (customer) {
		LogEngine.debug(`Found cached customer for Discord user ${user.id}`);
		return customer;
	}

	// Customer not found in cache, create a new one
	LogEngine.debug(`Creating new customer record for Discord user ${user.id}`);
	const customerId = await createCustomerInUnthread(user);

	// Construct customer object with both Discord and Unthread identifiers
	customer = {
		discordId: user.id,
		discordUsername: user.username,
		discordName: user.displayName || user.username,
		customerId,
		email: email || '',
	};

	// Store customer in cache for future lookups
	await setKey(key, customer);
	LogEngine.info(`Created new customer record for ${user.username} (${user.id})`);
	return customer;
}

/**
 * Retrieves a customer record by Discord user ID
 *
 * This is a lightweight lookup function that doesn't create a customer
 * if one doesn't exist. Use this when you only need to check if a
 * customer record exists but don't want to create one.
 *
 * @param discordId - Discord user ID
 * @returns Customer data object or null if not found
 *
 * @example
 * ```typescript
 * const customer = await getCustomerByDiscordId('123456789');
 * if (customer) {
 *   console.log(`Found customer: ${customer.email}`);
 * }
 * ```
 */
export async function getCustomerByDiscordId(discordId: string): Promise<Customer | null> {
	if (!discordId) {
		return null;
	}
	return (await getKey(`customer:${discordId}`)) as Customer | null;
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
 * @param customer - Customer object to update
 * @returns Updated customer object
 * @throws {Error} When invalid customer object is provided (missing discordId)
 * @throws {Error} When cache operations fail
 *
 * @example
 * ```typescript
 * const updatedCustomer = await updateCustomer({
 *   ...existingCustomer,
 *   email: 'newemail@example.com'
 * });
 * ```
 */
export async function updateCustomer(customer: Customer): Promise<Customer> {
	if (!customer || !customer.discordId) {
		throw new Error('Invalid customer object provided to updateCustomer');
	}

	const key = `customer:${customer.discordId}`;
	await setKey(key, customer);
	LogEngine.debug(`Updated customer record for ${customer.discordUsername} (${customer.discordId})`);
	return customer;
}