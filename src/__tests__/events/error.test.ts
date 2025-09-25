/**
 * Test Suite: Error Event Handler
 *
 * Comprehensive tests for the Discord.js error event handler.
 * Tests cover error logging, different error types, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Events } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { execute, name, once } from '../../events/error';

describe('error event handler', () => {
	beforeEach(() => {
		// Mock LogEngine.error
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('event configuration', () => {
		it('should have correct event name', () => {
			expect(name).toBe(Events.Error);
		});

		it('should not be a once-only event', () => {
			expect(once).toBe(false);
		});
	});

	describe('execute function', () => {
		it('should log error with stack trace when available', () => {
			const error = new Error('Test error message');
			error.stack = 'Error: Test error message\n    at test.js:1:1';

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledOnce();
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Test error message\n    at test.js:1:1'
			);
		});

		it('should log error message when stack trace is not available', () => {
			const error = new Error('Test error message');
			error.stack = undefined;

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledOnce();
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Test error message'
			);
		});

		it('should handle error objects without message', () => {
			const error = new Error();
			error.stack = undefined;

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledOnce();
			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error'
			);
		});

		it('should handle various error types', () => {
			const networkError = new Error('Network connection failed');
			networkError.name = 'NetworkError';
			networkError.stack = 'NetworkError: Network connection failed\n    at network.js:42:10';

			execute(networkError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: NetworkError: Network connection failed\n    at network.js:42:10'
			);
		});

		it('should handle errors with custom properties', () => {
			const customError = new Error('API Rate Limit Exceeded') as any;
			customError.code = 50035;
			customError.httpStatus = 429;
			customError.stack = 'Error: API Rate Limit Exceeded\n    at api.js:123:5';

			execute(customError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: API Rate Limit Exceeded\n    at api.js:123:5'
			);
		});

		it('should handle errors with very long stack traces', () => {
			const error = new Error('Complex error');
			error.stack = 'Error: Complex error\n' + 
				Array(100).fill('    at someFunction (file.js:1:1)').join('\n');

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledOnce();
			expect(LogEngine.error).toHaveBeenCalledWith(
				expect.stringContaining('Discord.js Client Error: Error: Complex error')
			);
		});

		it('should allow LogEngine errors to propagate', () => {
			// Mock LogEngine.error to throw
			(LogEngine.error as any).mockImplementation(() => {
				throw new Error('Logging failed');
			});

			const error = new Error('Original error');

			// Should throw the logging error
			expect(() => execute(error)).toThrow('Logging failed');
		});
	});

	describe('error logging integration', () => {
		it('should call LogEngine.error exactly once per error', () => {
			const error1 = new Error('First error');
			const error2 = new Error('Second error');

			execute(error1);
			execute(error2);

			expect(LogEngine.error).toHaveBeenCalledTimes(2);
		});

		it('should preserve error information in log message', () => {
			const error = new Error('Specific error message');
			error.stack = 'Error: Specific error message\n    at specific.js:10:5';

			execute(error);

			const logCall = (LogEngine.error as any).mock.calls[0][0];
			expect(logCall).toContain('Discord.js Client Error:');
			expect(logCall).toContain('Specific error message');
			expect(logCall).toContain('specific.js:10:5');
		});
	});

	describe('real-world error scenarios', () => {
		it('should handle WebSocket connection errors', () => {
			const wsError = new Error('WebSocket connection closed unexpectedly') as any;
			wsError.code = 'ECONNRESET';
			wsError.stack = 'Error: WebSocket connection closed unexpectedly\n    at WebSocket.js:200:15';

			execute(wsError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: WebSocket connection closed unexpectedly\n    at WebSocket.js:200:15'
			);
		});

		it('should handle Discord API errors', () => {
			const apiError = new Error('Invalid Form Body') as any;
			apiError.code = 50035;
			apiError.httpStatus = 400;
			apiError.stack = 'Error: Invalid Form Body\n    at DiscordAPI.js:150:8';

			execute(apiError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Invalid Form Body\n    at DiscordAPI.js:150:8'
			);
		});

		it('should handle permission errors', () => {
			const permError = new Error('Missing Access') as any;
			permError.code = 50001;
			permError.stack = 'Error: Missing Access\n    at permissions.js:75:3';

			execute(permError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Missing Access\n    at permissions.js:75:3'
			);
		});
	});

	describe('edge cases', () => {
		it('should handle null stack trace', () => {
			const error = new Error('Test error');
			(error as any).stack = null;

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Test error'
			);
		});

		it('should handle empty error message', () => {
			const error = new Error('');
			error.stack = 'Error: \n    at test.js:1:1';

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: \n    at test.js:1:1'
			);
		});

		it('should handle errors with special characters', () => {
			const error = new Error('Error with émojis 🚨 and ñ special chars');
			error.stack = 'Error: Error with émojis 🚨 and ñ special chars\n    at unicode.js:1:1';

			execute(error);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Discord.js Client Error: Error: Error with émojis 🚨 and ñ special chars\n    at unicode.js:1:1'
			);
		});
	});
});