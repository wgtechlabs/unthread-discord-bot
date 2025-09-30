/**
 * Customer Utilities - Discord-Unthread Integration
 *
 * @description
 * Manages customer data integration between Discord users and Unthread ticketing system
 * using the 3-layer BotsStore architecture. Handles customer creation, retrieval, and
 * mapping consistency across both platforms with unified storage persistence.
 *
 * @module utils/customerUtils
 * @since 1.0.0
 *
 * @keyFunctions
 * - getOrCreateCustomer(): Main entry point for customer management with caching
 * - getCustomerByDiscordId(): Fast customer lookup using Discord ID
 * - createCustomerInUnthread(): Internal API integration for customer creation
 *
 * @commonIssues
 * - Duplicate customer creation: Same Discord user creates multiple Unthread records
 * - API authentication failures: Invalid UNTHREAD_API_KEY during customer creation
 * - Storage layer inconsistency: Cache and database customer records diverge
 * - Email validation problems: Invalid or missing email addresses cause API failures
 * - Customer ID conflicts: Unthread response missing customerId or id fields
 *
 * @troubleshooting
 * - Check UNTHREAD_API_KEY validity and permissions for customer creation
 * - Verify BotsStore 3-layer storage consistency using validateConsistency()
 * - Monitor API response structure changes from Unthread customer endpoint
 * - Use LogEngine debug output to trace customer lookup and creation flow
 * - Validate Discord user objects have required ID and username fields
 * - Review cache TTL settings if customer lookups return stale data
 *
 * @performance
 * - Customer lookups cached in BotsStore for fast subsequent access
 * - 3-layer architecture: Memory → Redis → PostgreSQL with fallback
 * - API calls only made when customer doesn't exist in storage layers
 * - Concurrent customer creation handled with proper error boundaries
 *
 * @dependencies BotsStore, Discord.js User, Unthread API, LogEngine
 *
 * @example Basic Usage
 * ```typescript
 * const customer = await getOrCreateCustomer(discordUser, 'user@example.com');
 * console.log(`Customer ID: ${customer.unthreadCustomerId}`);
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Customer lookup with error handling
 * try {
 *   const existing = await getCustomerByDiscordId(userId);
 *   if (!existing) {
 *     const newCustomer = await getOrCreateCustomer(user, email);
 *     LogEngine.info(`Created customer: ${newCustomer.unthreadCustomerId}`);
 *   }
 * } catch (error) {
 *   LogEngine.error('Customer management failed', error);
 * }
 * ```
 */

import { BotsStore, Customer } from '../sdk/bots-brain/BotsStore';
import { LogEngine } from '../config/logger';
import { User } from 'discord.js';

// Re-export Customer interface for backward compatibility
export { Customer } from '../sdk/bots-brain/BotsStore';

/**
 * Creates customer record in Unthread system via API integration
 *
 * @async
 * @function createCustomerInUnthread
 * @param {User} user - Discord user object with username and ID
 * @returns {Promise<string>} Unthread customer ID from API response
 * @throws {Error} When UNTHREAD_API_KEY environment variable is not set
 * @throws {Error} When API request fails (4xx/5xx responses)
 * @throws {Error} When API response is missing customerId/id field
 * @private
 *
 * @example
 * ```typescript
 * const customerId = await createCustomerInUnthread(discordUser);
 * // Returns: "customer_abc123def456"
 * ```
 *
 * @troubleshooting
 * - Verify API key has customer creation permissions in Unthread
 * - Check Unthread API response format for field name changes
 * - Monitor API rate limits during bulk customer creation
 */
async function createCustomerInUnthread(user: User): Promise<string> {
	// Get API key (guaranteed to exist due to startup validation)
	const apiKey = process.env.UNTHREAD_API_KEY!;

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
 * Retrieves or creates customer record using 3-layer BotsStore architecture
 *
 * @async
 * @function getOrCreateCustomer
 * @param {User} user - Discord user object with ID and username
 * @param {string} [email=''] - User's email address for Unthread correspondence
 * @returns {Promise<Customer>} Customer record with Discord and Unthread IDs
 * @throws {Error} When invalid user object provided (missing id property)
 * @throws {Error} When customer creation in Unthread API fails
 * @throws {Error} When BotsStore storage operations fail
 *
 * @example
 * ```typescript
 * const customer = await getOrCreateCustomer(discordUser, 'user@example.com');
 * console.log(`Mapped: Discord ${customer.discordId} → Unthread ${customer.unthreadCustomerId}`);
 * ```
 *
 * @troubleshooting
 * - Ensure user object has valid ID and username properties
 * - Check BotsStore layer consistency if lookups return unexpected results
 * - Verify Unthread API permissions for customer creation
 * - Monitor storage layer performance for large user bases
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

	}
	catch (error) {
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
		}
		else {
			LogEngine.debug(`No customer found for Discord ID ${discordId}`);
		}

		return customer;

	}
	catch (error) {
		LogEngine.error('Error in getCustomerByDiscordId:', error);
		throw error;
	}
}