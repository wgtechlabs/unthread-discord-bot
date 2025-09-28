/**
 * Test Suite: Error Event Handler
 *
 * Tests for the global Discord.js error event handler that captures
 * and logs unhandled errors from the Discord client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events } from 'discord.js';
import { LogEngine } from '@config/logger';
import { name, execute, once } from '@events/error';

describe('Error Event Handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Event Configuration', () => {
		it('should export correct event name', () => {
			expect(name).toBe(Events.Error);
		});

		it('should be configured as recurring event (not once)', () => {
			expect(once).toBe(false);
		});
	});

	describe('Error Handling', () => {
		it('should log Discord client errors with stack trace', () => {
			const mockError = new Error('Test Discord error');
			mockError.stack = 'Error: Test Discord error\n    at test.js:1:1';

			execute(mockError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${mockError.stack}`
			);
		});

		it('should log error message when stack trace is not available', () => {
			const mockError = new Error('Test error without stack');
			// Remove stack trace
			delete mockError.stack;

			execute(mockError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${mockError.toString()}`
			);
		});

		it('should handle error objects with custom properties', () => {
			const customError = new Error('Custom error');
			(customError as any).code = 'CUSTOM_ERROR_CODE';
			(customError as any).details = { extra: 'info' };

			execute(customError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${customError.stack || customError}`
			);
		});

		it('should handle empty error messages', () => {
			const emptyError = new Error('');

			execute(emptyError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${emptyError.stack || emptyError}`
			);
		});

		it('should not throw or crash when handling errors', () => {
			const mockError = new Error('Critical Discord error');

			expect(() => execute(mockError)).not.toThrow();
		});
	});

	describe('Real-world Error Scenarios', () => {
		it('should handle WebSocket connection errors', () => {
			const wsError = new Error('WebSocket connection failed');
			wsError.name = 'WebSocketError';
			(wsError as any).code = 'ECONNRESET';

			execute(wsError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${wsError.stack || wsError}`
			);
		});

		it('should handle API rate limit errors', () => {
			const rateLimitError = new Error('Rate limit exceeded');
			(rateLimitError as any).httpStatus = 429;
			(rateLimitError as any).limit = 5;

			execute(rateLimitError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${rateLimitError.stack || rateLimitError}`
			);
		});

		it('should handle permission denied errors', () => {
			const permissionError = new Error('Missing Access');
			(permissionError as any).code = 50001;

			execute(permissionError);

			expect(LogEngine.error).toHaveBeenCalledWith(
				`Discord.js Client Error: ${permissionError.stack || permissionError}`
			);
		});
	});

	describe('Module Structure', () => {
		it('should export required properties', () => {
			expect(name).toBeDefined();
			expect(execute).toBeDefined();
			expect(typeof execute).toBe('function');
		});

		it('should have consistent function signature', () => {
			expect(execute.length).toBe(1); // Should accept one parameter (error)
		});
	});
});