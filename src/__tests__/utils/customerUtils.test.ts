/**
 * Test Suite: Customer Utils
 *
 * Basic tests for customer utility functions including API integration
 * and error handling scenarios (without SDK dependencies).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { User } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { getOrCreateCustomer, getCustomerByDiscordId } from '../../utils/customerUtils';

// Mock global fetch
global.fetch = vi.fn();

// Helper to create mock response
const createMockResponse = (data: any, options: { status?: number } = {}) => ({
	ok: (options.status || 200) >= 200 && (options.status || 200) < 300,
	status: options.status || 200,
	json: () => Promise.resolve(data),
	text: () => Promise.resolve(JSON.stringify(data)),
});

describe('customerUtils', () => {
	let mockUser: Partial<User>;
	let mockFetch: any;

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

		// Setup mock fetch
		mockFetch = global.fetch as any;
	});

	describe('getOrCreateCustomer', () => {
		it('should handle basic customer creation without SDK dependencies', async () => {
			// Mock API response for customer creation
			mockFetch.mockResolvedValueOnce(createMockResponse({ customerId: 'customer123' }));

			const result = await getOrCreateCustomer(mockUser as User, 'test@example.com');

			// Should return the customer ID if successful
			expect(result).toBe('customer123');
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/customers'),
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Authorization': 'Bearer test_api_key',
					}),
				})
			);
		});

		it('should handle API errors gracefully', async () => {
			// Mock API error response
			mockFetch.mockResolvedValueOnce(createMockResponse(
				{ error: 'Customer creation failed' },
				{ status: 400 }
			));

			const result = await getOrCreateCustomer(mockUser as User, 'test@example.com');

			// Should handle error gracefully
			expect(result).toBeNull();
			expect(LogEngine.error).toHaveBeenCalled();
		});

		it('should handle network errors', async () => {
			// Mock network error
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await getOrCreateCustomer(mockUser as User, 'test@example.com');

			// Should handle error gracefully
			expect(result).toBeNull();
			expect(LogEngine.error).toHaveBeenCalledWith(
				expect.stringContaining('Error creating customer'),
				expect.any(Error)
			);
		});
	});

	describe('getCustomerByDiscordId', () => {
		it('should handle customer retrieval without SDK dependencies', async () => {
			// Mock API response for customer retrieval
			mockFetch.mockResolvedValueOnce(createMockResponse({ 
				customerId: 'customer123',
				discordId: 'user123'
			}));

			const result = await getCustomerByDiscordId('user123');

			// Should return the customer data if found
			expect(result).toEqual(expect.objectContaining({
				customerId: 'customer123',
				discordId: 'user123'
			}));
		});

		it('should handle customer not found', async () => {
			// Mock API response for customer not found
			mockFetch.mockResolvedValueOnce(createMockResponse(null, { status: 404 }));

			const result = await getCustomerByDiscordId('user123');

			// Should return null if not found
			expect(result).toBeNull();
		});
	});

	describe('input validation', () => {
		it('should handle invalid user input', async () => {
			const result = await getOrCreateCustomer(null as any, 'test@example.com');

			// Should handle gracefully
			expect(result).toBeNull();
		});

		it('should handle invalid email input', async () => {
			const result = await getOrCreateCustomer(mockUser as User, '');

			// Should handle gracefully
			expect(result).toBeNull();
		});
	});
});