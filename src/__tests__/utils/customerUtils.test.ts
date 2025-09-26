/**
 * Test Suite: Customer Utils
 *
 * Comprehensive tests for customer utility functions including API integration,
 * storage operations, and error handling scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { User } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { BotsStore, Customer } from '../../sdk/bots-brain/BotsStore';
import { getOrCreateCustomer, getCustomerByDiscordId } from '../../utils/customerUtils';

// Mock external dependencies
vi.mock('../../sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(),
	},
}));

// Mock global fetch
global.fetch = vi.fn();

describe('customerUtils', () => {
	let mockUser: Partial<User>;
	let mockBotsStore: any;
	let mockCustomer: Customer;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Set up mock environment variable
		process.env.UNTHREAD_API_KEY = 'test_api_key';

		// Setup mock user
		mockUser = {
			id: 'user123',
			username: 'testuser',
			displayName: 'Test User',
		};

		// Setup mock customer
		mockCustomer = {
			discordId: 'user123',
			unthreadCustomerId: 'unthread123',
			email: 'test@example.com',
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Setup mock BotsStore
		mockBotsStore = {
			getCustomerByDiscordId: vi.fn(),
			storeCustomer: vi.fn(),
		};
		(BotsStore.getInstance as any).mockReturnValue(mockBotsStore);

		// Setup default fetch mock
		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ customerId: 'unthread123' }),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.UNTHREAD_API_KEY;
	});

	describe('getOrCreateCustomer', () => {
		it('should return existing customer when found in BotsStore', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(mockCustomer);

			const result = await getOrCreateCustomer(mockUser as User, 'test@example.com');

			expect(result).toEqual(mockCustomer);
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('user123');
			expect(LogEngine.debug).toHaveBeenCalledWith('Found existing customer for Discord user user123');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('should create new customer when not found in BotsStore', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			const result = await getOrCreateCustomer(mockUser as User, 'test@example.com');

			expect(result).toEqual(mockCustomer);
			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'testuser' }),
			});
			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, 'test@example.com', 'unthread123');
		});

		it('should use empty email when not provided', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(mockUser as User);

			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, '', 'unthread123');
		});

		it('should handle API response with id field instead of customerId', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 'unthread456' }),
			});

			const result = await getOrCreateCustomer(mockUser as User);

			expect(mockBotsStore.storeCustomer).toHaveBeenCalledWith(mockUser, '', 'unthread456');
		});

		it('should throw error when user object is invalid', async () => {
			await expect(getOrCreateCustomer(null as any)).rejects.toThrow(
				'Invalid user object provided to getOrCreateCustomer'
			);

			await expect(getOrCreateCustomer({} as User)).rejects.toThrow(
				'Invalid user object provided to getOrCreateCustomer'
			);
		});

		it('should throw error when API request fails', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 400,
			});

			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow(
				'Failed to create customer: 400'
			);
		});

		it('should throw error when API response is missing customerId and id', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ someOtherField: 'value' }),
			});

			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow(
				'Customer API response invalid, missing customerId'
			);
		});

		it('should handle BotsStore errors gracefully', async () => {
			const storeError = new Error('BotsStore error');
			mockBotsStore.getCustomerByDiscordId.mockRejectedValue(storeError);

			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow('BotsStore error');
			expect(LogEngine.error).toHaveBeenCalledWith('Error in getOrCreateCustomer:', storeError);
		});

		it('should handle network errors gracefully', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			const networkError = new Error('Network error');
			(global.fetch as any).mockRejectedValue(networkError);

			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow('Network error');
			expect(LogEngine.error).toHaveBeenCalledWith('Error in getOrCreateCustomer:', networkError);
		});

		it('should log customer creation process', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(mockUser as User);

			expect(LogEngine.info).toHaveBeenCalledWith('Creating new customer for Discord user user123');
			expect(LogEngine.info).toHaveBeenCalledWith('Customer created and stored: Discord user123 -> Unthread unthread123');
		});
	});

	describe('getCustomerByDiscordId', () => {
		it('should return customer when found', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(mockCustomer);

			const result = await getCustomerByDiscordId('user123');

			expect(result).toEqual(mockCustomer);
			expect(mockBotsStore.getCustomerByDiscordId).toHaveBeenCalledWith('user123');
			expect(LogEngine.debug).toHaveBeenCalledWith('Retrieved customer for Discord ID user123');
		});

		it('should return null when customer not found', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			const result = await getCustomerByDiscordId('user123');

			expect(result).toBeNull();
			expect(LogEngine.debug).toHaveBeenCalledWith('No customer found for Discord ID user123');
		});

		it('should throw error when Discord ID is empty', async () => {
			await expect(getCustomerByDiscordId('')).rejects.toThrow('Discord ID is required');
			await expect(getCustomerByDiscordId(null as any)).rejects.toThrow('Discord ID is required');
		});

		it('should handle BotsStore errors gracefully', async () => {
			const storeError = new Error('BotsStore error');
			mockBotsStore.getCustomerByDiscordId.mockRejectedValue(storeError);

			await expect(getCustomerByDiscordId('user123')).rejects.toThrow('BotsStore error');
			expect(LogEngine.error).toHaveBeenCalledWith('Error in getCustomerByDiscordId:', storeError);
		});
	});

	describe('API integration', () => {
		it('should use correct API endpoint and headers', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(mockUser as User);

			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'testuser' }),
			});
		});

		it('should handle different HTTP error codes', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);

			// Test 401 Unauthorized
			(global.fetch as any).mockResolvedValue({ ok: false, status: 401 });
			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow('Failed to create customer: 401');

			// Test 500 Internal Server Error
			(global.fetch as any).mockResolvedValue({ ok: false, status: 500 });
			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow('Failed to create customer: 500');
		});

		it('should handle JSON parsing errors', async () => {
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
			});

			await expect(getOrCreateCustomer(mockUser as User)).rejects.toThrow('Invalid JSON');
		});
	});

	describe('edge cases', () => {
		it('should handle users with special characters in username', async () => {
			const specialUser = { ...mockUser, username: 'user@#$%^&*()' };
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(specialUser as User);

			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: 'user@#$%^&*()' }),
			});
		});

		it('should handle very long usernames', async () => {
			const longUsername = 'a'.repeat(1000);
			const longUser = { ...mockUser, username: longUsername };
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(longUser as User);

			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: longUsername }),
			});
		});

		it('should handle empty username', async () => {
			const emptyUser = { ...mockUser, username: '' };
			mockBotsStore.getCustomerByDiscordId.mockResolvedValue(null);
			mockBotsStore.storeCustomer.mockResolvedValue(mockCustomer);

			await getOrCreateCustomer(emptyUser as User);

			expect(global.fetch).toHaveBeenCalledWith('https://api.unthread.io/api/customers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': 'test_api_key',
				},
				body: JSON.stringify({ name: '' }),
			});
		});
	});
});