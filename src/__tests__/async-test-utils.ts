/**
 * Async Test Utilities
 *
 * Provides utility functions for reliable async testing following log-engine patterns.
 * These utilities help with testing async operations, timeouts, and error handling.
 *
 * @module tests/async-test-utils
 */

import { vi } from 'vitest';

/**
 * Wait for a specified amount of time
 * Useful for testing time-dependent operations
 */
export function waitFor(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true with timeout
 * Polls the condition function until it returns true or timeout is reached
 */
export async function waitForCondition(
	condition: () => boolean | Promise<boolean>,
	timeoutMs: number = 5000,
	intervalMs: number = 100,
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const result = await condition();
		if (result) {
			return;
		}
		await waitFor(intervalMs);
	}

	throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Create a mock function that resolves after a delay
 * Useful for testing async operations with timing
 */
export function createDelayedMock<T>(
	returnValue: T,
	delayMs: number = 100,
): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation(async () => {
		await waitFor(delayMs);
		return returnValue;
	});
}

/**
 * Create a mock function that rejects after a delay
 * Useful for testing error handling scenarios
 */
export function createDelayedErrorMock(
	error: Error | string,
	delayMs: number = 100,
): ReturnType<typeof vi.fn> {
	const errorToThrow = typeof error === 'string' ? new Error(error) : error;
	return vi.fn().mockImplementation(async () => {
		await waitFor(delayMs);
		throw errorToThrow;
	});
}

/**
 * Test utility for verifying function calls with specific arguments
 * Provides better error messages than default Vitest matchers
 */
export function expectToHaveBeenCalledWithArgs(
	mockFn: ReturnType<typeof vi.fn>,
	expectedArgs: any[],
	callIndex: number = 0,
): void {
	const calls = mockFn.mock.calls;

	if (calls.length <= callIndex) {
		throw new Error(`Expected mock to be called at least ${callIndex + 1} times, but was called ${calls.length} times`);
	}

	const actualArgs = calls[callIndex];

	if (actualArgs.length !== expectedArgs.length) {
		throw new Error(`Expected call ${callIndex} to have ${expectedArgs.length} arguments, but had ${actualArgs.length}`);
	}

	for (let i = 0; i < expectedArgs.length; i++) {
		if (actualArgs[i] !== expectedArgs[i]) {
			throw new Error(`Expected call ${callIndex} argument ${i} to be ${expectedArgs[i]}, but was ${actualArgs[i]}`);
		}
	}
}

/**
 * Create a mock function that tracks call order for sequential testing
 * Useful for testing that operations happen in the correct order
 */
export function createSequentialMock<T>(
	responses: (T | Error)[],
): ReturnType<typeof vi.fn> {
	let callCount = 0;

	return vi.fn().mockImplementation(async () => {
		if (callCount >= responses.length) {
			throw new Error(`Mock called more times than expected (${callCount + 1} > ${responses.length})`);
		}

		const response = responses[callCount++];

		if (response instanceof Error) {
			throw response;
		}

		return response;
	});
}

/**
 * Test a function that should complete within a specific time
 * Fails if the function takes too long or too short
 */
export async function expectToCompleteWithin(
	fn: () => Promise<any>,
	minMs: number,
	maxMs: number,
): Promise<void> {
	const startTime = Date.now();

	try {
		await fn();
	}
	catch {
		// Allow the function to throw, but still check timing
	}

	const elapsed = Date.now() - startTime;

	if (elapsed < minMs) {
		throw new Error(`Function completed too quickly: ${elapsed}ms < ${minMs}ms`);
	}

	if (elapsed > maxMs) {
		throw new Error(`Function took too long: ${elapsed}ms > ${maxMs}ms`);
	}
}

/**
 * Create a controlled promise that can be resolved/rejected manually
 * Useful for testing async code with precise timing control
 */
export function createControlledPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  } {
	let resolve: (value: T) => void;
	let reject: (error: Error) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {
		promise,
		resolve: resolve!,
		reject: reject!,
	};
}

/**
 * Mock fetch with specific responses for different URLs
 * Useful for testing API integrations with multiple endpoints
 */
export function createFetchMock(
	responses: Record<string, any>,
): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation(async (url: string) => {
		const response = responses[url];

		if (!response) {
			throw new Error(`No mock response configured for URL: ${url}`);
		}

		if (response instanceof Error) {
			throw response;
		}

		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			json: async () => response,
			text: async () => JSON.stringify(response),
			headers: new Headers(),
		};
	});
}

/**
 * Create a mock timer that advances time in tests
 * Useful for testing time-based operations without waiting
 */
export function createMockTimer(): {
  advance: (ms: number) => void;
  restore: () => void;
  } {
	const realSetTimeout = global.setTimeout;
	const realClearTimeout = global.clearTimeout;
	const realDate = global.Date;

	let currentTime = Date.now();
	const timers: Map<number, { callback: () => void; time: number }> = new Map();
	let timerId = 1;

	// Mock setTimeout with proper typing
	const mockSetTimeout = vi.fn().mockImplementation((callback: () => void, delay: number = 0) => {
		const id = timerId++;
		timers.set(id, {
			callback,
			time: currentTime + delay,
		});
		return id;
	});

	// Add required properties for Node.js setTimeout type compatibility
	(mockSetTimeout as any).__promisify__ = vi.fn();
	global.setTimeout = mockSetTimeout as any;

	// Mock clearTimeout
	global.clearTimeout = vi.fn().mockImplementation((id: number) => {
		timers.delete(id);
	});

	// Mock Date.now
	global.Date.now = vi.fn().mockImplementation(() => currentTime);

	return {
		advance: (ms: number) => {
			currentTime += ms;

			// Execute any timers that should have fired
			for (const [id, timer] of timers.entries()) {
				if (timer.time <= currentTime) {
					timer.callback();
					timers.delete(id);
				}
			}
		},
		restore: () => {
			global.setTimeout = realSetTimeout;
			global.clearTimeout = realClearTimeout;
			global.Date.now = realDate.now.bind(realDate);
		},
	};
}