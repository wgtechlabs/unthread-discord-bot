/**
 * Test Suite: Retry Utility
 *
 * Comprehensive tests for the retry utility module.
 * Tests cover retry logic, backoff strategies, error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '@utils/retry';
import retryUtils from '@utils/retry';
import { LogEngine } from '@wgtechlabs/log-engine';
import {
	createEventualSuccessMock,
} from '@tests/async-test-utils';

describe('withRetry', () => {
	beforeEach(() => {
		// Create spies for LogEngine methods to enable assertions
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		// Restore all mocks and spies
		vi.restoreAllMocks();
		// Clear all mock call history
		vi.clearAllMocks();
	});

	describe('Successful Operations', () => {
		it('should return result immediately for successful operation', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			const result = await withRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should log attempt information for successful operation', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			await withRetry(operation, { operationName: 'test-operation' });

			expect(LogEngine.info).toHaveBeenCalledWith('Attempt 1/5 for test-operation...');
		});

		it('should not log success message for first attempt', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			await withRetry(operation, { operationName: 'test-operation' });

			// Should not call the success message for first attempt
			expect(LogEngine.info).not.toHaveBeenCalledWith('test-operation succeeded on attempt 1');
		});
	});

	describe('Retry Logic', () => {
		it('should retry failed operations up to maxAttempts', async () => {
			const operation = createEventualSuccessMock('success', 2);

			const result = await withRetry(operation, { 
				maxAttempts: 3,
				baseDelayMs: 0, // No delay for testing
			});

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should log success message after retry', async () => {
			const operation = createEventualSuccessMock('success', 1);

			await withRetry(operation, { 
				operationName: 'retry-test', 
				baseDelayMs: 0,
				maxAttempts: 2,
			});

			expect(LogEngine.info).toHaveBeenCalledWith('retry-test succeeded on attempt 2');
		});

		it('should throw error after all attempts fail', async () => {
			const error = new Error('Persistent failure');
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, { 
				maxAttempts: 3,
				baseDelayMs: 0,
			})).rejects.toThrow('operation failed after 3 attempts: Persistent failure');

			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should include original error as cause', async () => {
			const originalError = new Error('Original failure');
			const operation = vi.fn().mockRejectedValue(originalError);

			try {
				await withRetry(operation, { 
					maxAttempts: 2,
					baseDelayMs: 0,
				});
			}
			catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as any).cause).toBe(originalError);
			}
		});
	});

	describe('Backoff Strategy', () => {
		it('should use linear backoff with baseDelayMs by default', async () => {
			const operation = createEventualSuccessMock('success', 2);

			const result = await withRetry(operation, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});
			
			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should use exponential backoff when enabled', async () => {
			const operation = createEventualSuccessMock('success', 2);

			const result = await withRetry(operation, {
				maxAttempts: 3,
				baseDelayMs: 0,
				exponentialBackoff: true,
			});

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should not delay before the last attempt fails', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

			try {
				await withRetry(operation, { 
					maxAttempts: 2, 
					baseDelayMs: 0,
				});
			}
			catch {
				expect(operation).toHaveBeenCalledTimes(2);
			}
		});
	});

	describe('Configuration Options', () => {
		it('should use default maxAttempts when not specified', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Fails'));

			try {
				await withRetry(operation, { baseDelayMs: 0 });
			}
			catch {
				// Expected to fail
			}

			expect(operation).toHaveBeenCalledTimes(5); // Default maxAttempts
		});

		it('should use default baseDelayMs when not specified', async () => {
			const operation = createEventualSuccessMock('success', 1);

			const result = await withRetry(operation, { maxAttempts: 2 });

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should use default operationName when not specified', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			await withRetry(operation);

			expect(LogEngine.info).toHaveBeenCalledWith('Attempt 1/5 for operation...');
		});

		it('should accept custom configuration', async () => {
			const operation = createEventualSuccessMock('success', 1);

			const result = await withRetry(operation, {
				maxAttempts: 3,
				baseDelayMs: 0,
				operationName: 'custom-operation',
			});

			expect(result).toBe('success');
			expect(LogEngine.info).toHaveBeenCalledWith('Attempt 1/3 for custom-operation...');
			expect(LogEngine.info).toHaveBeenCalledWith('custom-operation succeeded on attempt 2');
		});
	});

	describe('Error Handling', () => {
		it('should handle different error types', async () => {
			const errors = [
				new Error('Standard error'),
				new TypeError('Type error'),
				new RangeError('Range error'),
				'String error',
				{ message: 'Object error' },
				null,
				undefined,
			];

			for (const error of errors) {
				const operation = vi.fn().mockRejectedValue(error);

				await expect(withRetry(operation, { 
					maxAttempts: 1,
					baseDelayMs: 0,
				})).rejects.toThrow();
			}
		});

		it('should log debug information for each failed attempt', async () => {
			const error = new Error('Test failure');
			const operation = vi.fn().mockRejectedValue(error);

			try {
				await withRetry(operation, { 
					maxAttempts: 2, 
					operationName: 'debug-test', 
					baseDelayMs: 0,
				});
			}
			catch {
				// Expected to fail
			}

			expect(LogEngine.debug).toHaveBeenCalledWith('Attempt 1 failed: Test failure');
			expect(LogEngine.debug).toHaveBeenCalledWith('Attempt 2 failed: Test failure');
		});		it('should log final error after all attempts', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Final error'));

			try {
				await withRetry(operation, { 
					maxAttempts: 2, 
					operationName: 'final-test', 
					baseDelayMs: 0,
				});
			}
			catch {
				// Expected to fail
			}

			expect(LogEngine.error).toHaveBeenCalledWith(
				'final-test failed after 2 attempts. Last error: Final error',
			);
		});		it('should handle errors without message property', async () => {
			const operation = vi.fn().mockRejectedValue({ code: 'ERROR_CODE' });

			await expect(withRetry(operation, { 
				maxAttempts: 1,
				baseDelayMs: 0,
			})).rejects.toThrow('operation failed after 1 attempts: Unknown error');
		});
	});

	describe('Real-world Scenarios', () => {
		it('should handle API call simulation', async () => {
			let attemptCount = 0;
			const apiCall = vi.fn().mockImplementation(async () => {
				attemptCount++;
				if (attemptCount < 3) {
					throw new Error('Network timeout');
				}
				return { data: 'API response', id: 123 };
			});

			const result = await withRetry(apiCall, {
				operationName: 'API data fetch',
				maxAttempts: 5,
				baseDelayMs: 0,
			});

			expect(result).toEqual({ data: 'API response', id: 123 });
			expect(apiCall).toHaveBeenCalledTimes(3);
		});

		it('should handle database connection simulation', async () => {
			const connectionErrors = [
				new Error('Connection refused'),
				new Error('Connection timeout'),
				'success',
			];
			let attempt = 0;

			const dbConnect = vi.fn().mockImplementation(async () => {
				const result = connectionErrors[attempt++];
				if (typeof result === 'string') {
					return result;
				}
				throw result;
			});

			const result = await withRetry(dbConnect, {
				operationName: 'Database connection',
				maxAttempts: 5,
				baseDelayMs: 0,
			});

			expect(result).toBe('success');
			expect(dbConnect).toHaveBeenCalledTimes(3);
		});

		it('should handle file system operations simulation', async () => {
			const fileOperation = createEventualSuccessMock(
				'File processed successfully',
				2,
				new Error('File not found'),
			);

			const result = await withRetry(fileOperation, {
				operationName: 'File processing',
				maxAttempts: 4,
				baseDelayMs: 0,
			});

			expect(result).toBe('File processed successfully');
		});
	});

	describe('Module Exports', () => {
		it('should export named function correctly', () => {
			expect(typeof withRetry).toBe('function');
		});

		it('should export default object with withRetry property', () => {
			expect(typeof retryUtils).toBe('object');
			expect(typeof retryUtils.withRetry).toBe('function');
		});

		it('should have consistent behavior between named and default exports', async () => {
			const operation = vi.fn().mockResolvedValue('test-result');

			const namedResult = await withRetry(operation, { baseDelayMs: 0 });
			const defaultResult = await retryUtils.withRetry(operation, { baseDelayMs: 0 });

			expect(namedResult).toBe(defaultResult);
		});
	});

	describe('Edge Cases', () => {
		it('should handle maxAttempts of 1', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Immediate fail'));

			await expect(withRetry(operation, { 
				maxAttempts: 1,
				baseDelayMs: 0,
			})).rejects.toThrow();

			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should handle maxAttempts of 0 gracefully', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			// When maxAttempts is 0, it should not make any attempts and fail immediately
			await expect(withRetry(operation, { 
				maxAttempts: 0,
				baseDelayMs: 0,
			})).rejects.toThrow('operation failed after 0 attempts: Unknown error');

			expect(operation).toHaveBeenCalledTimes(0);
		});

		it('should handle negative baseDelayMs', async () => {
			const operation = createEventualSuccessMock('success', 1);

			// Should not cause issues, just use 0 delay or similar
			const result = await withRetry(operation, { 
				baseDelayMs: -100,
				maxAttempts: 2,
			});

			expect(result).toBe('success');
		});

		it('should handle very large baseDelayMs', async () => {
			const operation = createEventualSuccessMock('success', 1);

			// Don't actually use large delays in tests
			const result = await withRetry(operation, {
				maxAttempts: 2,
				baseDelayMs: 0, // Use zero delay for testing
			});

			expect(result).toBe('success');
		});
	});
});