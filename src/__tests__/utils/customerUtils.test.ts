/**
 * Test Suite: Customer Utilities
 *
 * Comprehensive tests for the customer utility module.
 * Tests cover customer creation, retrieval, and integration with BotsStore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateCustomer, getCustomerByDiscordId, Customer } from '@utils/customerUtils';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '@sdk/bots-brain/BotsStore';

// Mock the BotsStore
vi.mock('@sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(),
	},
}));

describe('customerUtils', () => {
	let mockBotsStore: any;
	let mockUser: any;

	beforeEach(() => {
		// Create spies for LogEngine methods to enable assertions
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Set up environment variables
		process.env.UNTHREAD_API_KEY = 'test_api_key';

		// Create mock user
		mockUser = {
			id: 'test_user_123',
			username: 'testuser',
			displayName: 'Test User',
		};

		// Create mock BotsStore instance
		mockBotsStore = {
			getCustomerByDiscordId: vi.fn(),
			storeCustomer: vi.fn(),
		};

		// Mock BotsStore.getInstance to return our mock
		(BotsStore.getInstance as any).mockReturnValue(mockBotsStore);

		// Mock global fetch
		global.fetch = vi.fn();
	});

	afterEach(() => {
		// Restore all mocks and spies
		vi.restoreAllMocks();
		// Clear all mock call history
		vi.clearAllMocks();
		// Reset environment variables
		delete process.env.UNTHREAD_API_KEY;
	});

	describe('getOrCreateCustomer', () => {
		it('should return existing customer when found in BotsStore', async () => {
			const existingCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_123',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(existingCustomer);

			const result = await getOrCreateCustomer(mockUser, 'test@example.com');

			expect(result).toBe(existingCustomer);
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('test_user_123');
			expect(LogEngine.debug).toHaveBeenCalledWith('Found existing customer for Discord user test_user_123');
			expect(mockBotsStore.storeCustomer).not.toHaveBeenCalled();
		});

		it('should create new customer when not found in BotsStore', async () => {
			const newCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_456',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// Mock BotsStore to return null (customer not found)
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(newCustomer);

			// Mock Unthread API response
			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_456' }),
			});

			const result = await getOrCreateCustomer(mockUser, 'test@example.com');

			expect(result).toBe(newCustomer);
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('test_user_123');
			expect(LogEngine.info).toHaveBeenCalledWith('Creating new customer for Discord user test_user_123');
			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'testuser' }),
			});
			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, 'test@example.com', 'ut_customer_456');
			expect(LogEngine.info).toHaveBeenCalledWith('Customer created and stored: Discord test_user_123 -> Unthread ut_customer_456');
		});

		it('should handle Unthread API response with id field instead of customerId', async () => {
			const newCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_789',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(newCustomer);

			// Mock Unthread API response with 'id' field instead of 'customerId'
			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ id: 'ut_customer_789' }),
			});

			const result = await getOrCreateCustomer(mockUser, 'test@example.com');

			expect(result).toBe(newCustomer);
			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, 'test@example.com', 'ut_customer_789');
		});

		it('should throw error when user is invalid', async () => {
			await expect(getOrCreateCustomer(null as any, 'test@example.com')).rejects.toThrow(
				'Invalid user object provided to getOrCreateCustomer'
			);

			await expect(getOrCreateCustomer({ id: null } as any, 'test@example.com')).rejects.toThrow(
				'Invalid user object provided to getOrCreateCustomer'
			);

			await expect(getOrCreateCustomer({ username: 'test' } as any, 'test@example.com')).rejects.toThrow(
				'Invalid user object provided to getOrCreateCustomer'
			);
		});

		it('should handle missing UNTHREAD_API_KEY', async () => {
			delete process.env.UNTHREAD_API_KEY;
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			// Mock to avoid fetch call issues
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 401,
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow();

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getOrCreateCustomer:',
				expect.any(Error)
			);
		});

		it('should handle Unthread API errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			// Mock API error response
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 400,
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Failed to create customer: 400'
			);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getOrCreateCustomer:',
				expect.any(Error)
			);
		});

		it('should handle invalid Unthread API response', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			// Mock API response without customer ID
			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ name: 'testuser' }),
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Customer API response invalid, missing customerId'
			);
		});

		it('should handle network errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			// Mock network error
			(global.fetch as any).mockRejectedValue(new Error('Network error'));

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Network error'
			);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getOrCreateCustomer:',
				expect.any(Error)
			);
		});

		it('should handle BotsStore errors during customer retrieval', async () => {
			mockBotsStore.getCustomerByDiscordId.mockRejectedValue(new Error('Database error'));

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Database error'
			);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getOrCreateCustomer:',
				expect.any(Error)
			);
		});

		it('should handle BotsStore errors during customer storage', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockRejectedValue(new Error('Storage error'));

			// Mock successful Unthread API response
			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_123' }),
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Storage error'
			);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getOrCreateCustomer:',
				expect.any(Error)
			);
		});

		it('should work with empty email', async () => {
			const newCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_123',
				email: '',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(newCustomer);

			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_123' }),
			});

			const result = await getOrCreateCustomer(mockUser);

			expect(result).toBe(newCustomer);
			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, '', 'ut_customer_123');
		});

		it('should handle different user object shapes', async () => {
			const userWithDifferentProps = {
				id: 'test_user_456',
				username: 'different_user',
				globalName: 'Different User',
			};

			const newCustomer: Customer = {
				discordId: 'test_user_456',
				unthreadCustomerId: 'ut_customer_456',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(newCustomer);

			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_456' }),
			});

			const result = await getOrCreateCustomer(userWithDifferentProps, 'test@example.com');

			expect(result).toBe(newCustomer);
			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'different_user' }),
			});
		});
	});

	describe('Module Integration', () => {
		it('should export Customer interface and functions', () => {
			// This test ensures the Customer interface and functions are properly exported
			expect(typeof getOrCreateCustomer).toBe('function');
			expect(typeof getCustomerByDiscordId).toBe('function');
		});

		it('should handle complete customer lifecycle', async () => {
			// First call - should create customer
			mockBotsStore.getCustomerByDiscordId.mockResolvedValueOnce(null);
			
			const newCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_123',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.storeCustomer.mockResolvedValue(newCustomer);

			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_123' }),
			});

			const firstResult = await getOrCreateCustomer(mockUser, 'test@example.com');
			expect(firstResult).toBe(newCustomer);
			expect(mockBotsStore.storeCustomer).toHaveBeenCalled();

			// Second call - should return existing customer
			mockBotsStore.getCustomerByDiscordId.mockResolvedValueOnce(newCustomer);

			const secondResult = await getOrCreateCustomer(mockUser, 'test@example.com');
			expect(secondResult).toBe(newCustomer);
			
			// Should have been called twice total (once for each call)
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledTimes(2);
			// Store should only have been called once (for creation)
			expect(mockBotsStore.storeCustomer).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle malformed JSON response from Unthread API', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.reject(new Error('Invalid JSON')),
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Invalid JSON'
			);
		});

		it('should handle timeout errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			const timeoutError = new Error('Request timeout');
			timeoutError.name = 'AbortError';
			(global.fetch as any).mockRejectedValue(timeoutError);

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Request timeout'
			);
		});

		it('should handle server errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 500,
			});

			await expect(getOrCreateCustomer(mockUser, 'test@example.com')).rejects.toThrow(
				'Failed to create customer: 500'
			);
		});

		it('should handle special characters in username', async () => {
			const userWithSpecialChars = {
				id: 'test_user_special',
				username: 'test_user_@#$%',
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue({
				discordId: 'test_user_special',
				unthreadCustomerId: 'ut_customer_special',
				email: '',
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ customerId: 'ut_customer_special' }),
			});

			await getOrCreateCustomer(userWithSpecialChars);

			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'test_user_@#$%' }),
			});
		});
	});

	describe('getCustomerByDiscordId', () => {
		it('should return customer when found', async () => {
			const existingCustomer: Customer = {
				discordId: 'test_user_123',
				unthreadCustomerId: 'ut_customer_123',
				email: 'test@example.com',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(existingCustomer);

			const result = await getCustomerByDiscordId('test_user_123');

			expect(result).toBe(existingCustomer);
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('test_user_123');
			expect(LogEngine.debug).toHaveBeenCalledWith('Retrieved customer for Discord ID test_user_123');
		});

		it('should return null when customer not found', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			const result = await getCustomerByDiscordId('nonexistent_user');

			expect(result).toBeNull();
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('nonexistent_user');
			expect(LogEngine.debug).toHaveBeenCalledWith('No customer found for Discord ID nonexistent_user');
		});

		it('should throw error for empty Discord ID', async () => {
			await expect(getCustomerByDiscordId('')).rejects.toThrow('Discord ID is required');
		});

		it('should handle BotsStore errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockRejectedValue(new Error('Database error'));

			await expect(getCustomerByDiscordId('test_user_123')).rejects.toThrow('Database error');

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error in getCustomerByDiscordId:',
				expect.any(Error)
			);
		});
	});
});