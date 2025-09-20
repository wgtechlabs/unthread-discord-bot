/**
 * Advanced Async Testing Utilities
 *
 * Comprehensive set of testing utilities for handling asynchronous operations,
 * controlled timing, and complex mock scenarios in the Discord bot tests.
 *
 * Key Features:
 * - Async operation helpers (waitFor, waitForCondition)
 * - Mock factories (createDelayedMock, createSequentialMock)
 * - Controlled promise utilities for testing race conditions
 * - Fetch mocking utilities for API testing
 * - Timer manipulation helpers for time-based operations
 *
 * @module __tests__/async-test-utils
 */

import { vi } from 'vitest';

// =============================================================================
// ASYNC WAITING UTILITIES
// =============================================================================

/**
 * Configuration options for async waiting operations
 */
export interface WaitOptions {
  /** Maximum time to wait in milliseconds (default: 5000) */
  timeout?: number;
  /** Interval between condition checks in milliseconds (default: 50) */
  interval?: number;
  /** Custom error message for timeout (optional) */
  timeoutMessage?: string;
}

/**
 * Waits for a condition to become true with configurable timeout and interval
 *
 * @param condition - Function that returns true when the wait should end
 * @param options - Configuration for timeout and interval
 * @throws Error when timeout is reached before condition becomes true
 *
 * @example
 * ```typescript
 * // Wait for a mock to be called
 * await waitForCondition(() => mockFunction.mock.calls.length > 0);
 *
 * // Wait with custom timeout and message
 * await waitForCondition(
 *   () => someAsyncState.isReady,
 *   { timeout: 10000, timeoutMessage: 'State never became ready' }
 * );
 * ```
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, timeoutMessage } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await sleep(interval);
  }

  const message = timeoutMessage || `Condition not met within ${timeout}ms`;
  throw new Error(message);
}

/**
 * Waits for a specified number of milliseconds
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified time
 *
 * @example
 * ```typescript
 * // Wait for 100ms
 * await waitFor(100);
 * ```
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Alias for waitFor for semantic clarity in sleep scenarios
 */
export const sleep = waitFor;

/**
 * Waits for the next event loop tick
 *
 * @example
 * ```typescript
 * // Wait for next tick to allow promises to resolve
 * await nextTick();
 * ```
 */
export async function nextTick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

// =============================================================================
// MOCK FACTORIES
// =============================================================================

/**
 * Creates a mock function that resolves after a specified delay
 *
 * @param resolveValue - Value to resolve with
 * @param delay - Delay in milliseconds before resolving
 * @returns Mock function that resolves after delay
 *
 * @example
 * ```typescript
 * const slowApi = createDelayedMock({ data: 'response' }, 1000);
 * const result = await slowApi(); // Resolves after 1 second
 * ```
 */
export function createDelayedMock<T>(
  resolveValue: T,
  delay: number
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async () => {
    await waitFor(delay);
    return resolveValue;
  });
}

/**
 * Creates a mock function that fails after a specified delay
 *
 * @param error - Error to reject with
 * @param delay - Delay in milliseconds before rejecting
 * @returns Mock function that rejects after delay
 *
 * @example
 * ```typescript
 * const failingApi = createDelayedErrorMock(new Error('API failed'), 500);
 * await expect(failingApi()).rejects.toThrow('API failed');
 * ```
 */
export function createDelayedErrorMock(
  error: Error,
  delay: number
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async () => {
    await waitFor(delay);
    throw error;
  });
}

/**
 * Creates a mock function that returns different values on successive calls
 *
 * @param values - Array of values to return in sequence
 * @returns Mock function that cycles through values
 *
 * @example
 * ```typescript
 * const mock = createSequentialMock(['first', 'second', 'third']);
 * expect(mock()).toBe('first');
 * expect(mock()).toBe('second');
 * expect(mock()).toBe('third');
 * expect(mock()).toBe('first'); // Cycles back
 * ```
 */
export function createSequentialMock<T>(values: T[]): ReturnType<typeof vi.fn> {
  let callCount = 0;
  return vi.fn().mockImplementation(() => {
    const value = values[callCount % values.length];
    callCount++;
    return value;
  });
}

/**
 * Creates a mock function that succeeds after failing a specified number of times
 *
 * @param successValue - Value to return on success
 * @param failureCount - Number of times to fail before succeeding
 * @param error - Error to throw during failures
 * @returns Mock function that eventually succeeds
 *
 * @example
 * ```typescript
 * const retryableMock = createEventualSuccessMock('success', 2, new Error('temp fail'));
 * await expect(retryableMock()).rejects.toThrow('temp fail'); // 1st call fails
 * await expect(retryableMock()).rejects.toThrow('temp fail'); // 2nd call fails
 * expect(await retryableMock()).toBe('success'); // 3rd call succeeds
 * ```
 */
export function createEventualSuccessMock<T>(
  successValue: T,
  failureCount: number,
  error: Error = new Error('Temporary failure')
): ReturnType<typeof vi.fn> {
  let attempts = 0;
  return vi.fn().mockImplementation(async () => {
    attempts++;
    if (attempts <= failureCount) {
      throw error;
    }
    return successValue;
  });
}

// =============================================================================
// CONTROLLED PROMISE UTILITIES
// =============================================================================

/**
 * Creates a promise that can be manually resolved or rejected
 * Useful for testing race conditions and timing-sensitive code
 */
export interface ControlledPromise<T> {
  /** The promise that can be awaited */
  promise: Promise<T>;
  /** Function to resolve the promise */
  resolve: (value: T) => void;
  /** Function to reject the promise */
  reject: (reason?: any) => void;
  /** Whether the promise has been settled */
  isSettled: boolean;
}

/**
 * Creates a controlled promise for fine-grained async testing
 *
 * @returns ControlledPromise object with manual control
 *
 * @example
 * ```typescript
 * const controlled = createControlledPromise<string>();
 * 
 * // Start async operation
 * const resultPromise = myAsyncFunction(controlled.promise);
 * 
 * // Verify intermediate state
 * expect(controlled.isSettled).toBe(false);
 * 
 * // Manually resolve when ready
 * controlled.resolve('test result');
 * const result = await resultPromise;
 * ```
 */
export function createControlledPromise<T>(): ControlledPromise<T> {
  let resolveFunction: (value: T) => void;
  let rejectFunction: (reason?: any) => void;
  let settled = false;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFunction = (value: T) => {
      settled = true;
      resolve(value);
    };
    rejectFunction = (reason?: any) => {
      settled = true;
      reject(reason);
    };
  });

  return {
    promise,
    resolve: resolveFunction!,
    reject: rejectFunction!,
    get isSettled() { return settled; }
  };
}

// =============================================================================
// FETCH MOCKING UTILITIES
// =============================================================================

/**
 * Response configuration for fetch mock
 */
export interface MockFetchResponse {
  /** HTTP status code (default: 200) */
  status?: number;
  /** Response headers (optional) */
  headers?: Record<string, string>;
  /** Response body (will be JSON.stringify'd if object) */
  body?: any;
  /** Whether response is ok (default: status < 400) */
  ok?: boolean;
  /** Delay before response in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Creates a fetch mock with specified responses for different URLs
 *
 * @param responses - Map of URL patterns to response configurations
 * @returns Mock fetch function
 *
 * @example
 * ```typescript
 * const mockFetch = createFetchMock({
 *   'https://api.unthread.com/customers': {
 *     status: 201,
 *     body: { customerId: 'test123' }
 *   },
 *   'https://api.unthread.com/tickets': {
 *     status: 500,
 *     body: { error: 'Server error' }
 *   }
 * });
 * 
 * global.fetch = mockFetch;
 * ```
 */
export function createFetchMock(
  responses: Record<string, MockFetchResponse>
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string | URL, options?: any) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    // Find matching response pattern
    let matchedResponse: MockFetchResponse | undefined;
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlString.includes(pattern) || new RegExp(pattern).test(urlString)) {
        matchedResponse = response;
        break;
      }
    }
    
    // Default response if no pattern matches
    if (!matchedResponse) {
      matchedResponse = { status: 404, body: { error: 'Not found' } };
    }
    
    const {
      status = 200,
      headers = {},
      body = {},
      ok = status < 400,
      delay = 0
    } = matchedResponse;
    
    // Add delay if specified
    if (delay > 0) {
      await waitFor(delay);
    }
    
    // Create response body
    const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
    
    return {
      ok,
      status,
      headers: new Headers(headers),
      json: vi.fn().mockResolvedValue(typeof body === 'string' ? JSON.parse(body) : body),
      text: vi.fn().mockResolvedValue(responseBody),
      blob: vi.fn().mockResolvedValue(new Blob([responseBody])),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
    };
  });
}

/**
 * Creates a simple fetch mock that always returns the same response
 *
 * @param response - Response configuration
 * @returns Mock fetch function
 */
export function createSimpleFetchMock(response: MockFetchResponse): ReturnType<typeof vi.fn> {
  return createFetchMock({ '.*': response });
}

// =============================================================================
// TIMER MANIPULATION UTILITIES
// =============================================================================

/**
 * Advances fake timers and waits for any scheduled promises
 *
 * @param ms - Milliseconds to advance
 *
 * @example
 * ```typescript
 * vi.useFakeTimers();
 * 
 * const delayed = setTimeout(() => console.log('done'), 1000);
 * await advanceTimersAndWait(1000);
 * 
 * vi.useRealTimers();
 * ```
 */
export async function advanceTimersAndWait(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await nextTick(); // Allow any scheduled promises to resolve
}

/**
 * Runs all pending timers and waits for promises
 *
 * @example
 * ```typescript
 * vi.useFakeTimers();
 * 
 * setTimeout(() => console.log('done'), 1000);
 * await runAllTimersAndWait();
 * 
 * vi.useRealTimers();
 * ```
 */
export async function runAllTimersAndWait(): Promise<void> {
  vi.runAllTimers();
  await nextTick();
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Asserts that a mock was called with specific arguments within a timeout
 *
 * @param mockFn - Mock function to check
 * @param expectedArgs - Expected arguments
 * @param options - Wait options
 *
 * @example
 * ```typescript
 * const mockFn = vi.fn();
 * 
 * // Trigger async operation that should call mockFn
 * triggerAsyncOperation();
 * 
 * // Wait for mock to be called with expected args
 * await expectMockCalledWith(mockFn, ['expected', 'args']);
 * ```
 */
export async function expectMockCalledWith(
  mockFn: ReturnType<typeof vi.fn>,
  expectedArgs: any[],
  options: WaitOptions = {}
): Promise<void> {
  await waitForCondition(
    () => mockFn.mock.calls.some(call => 
      call.length === expectedArgs.length && 
      call.every((arg, index) => arg === expectedArgs[index])
    ),
    {
      ...options,
      timeoutMessage: options.timeoutMessage || 
        `Mock was not called with expected arguments: ${JSON.stringify(expectedArgs)}`
    }
  );
}

/**
 * Asserts that a mock was called a specific number of times within a timeout
 *
 * @param mockFn - Mock function to check
 * @param expectedCalls - Expected number of calls
 * @param options - Wait options
 */
export async function expectMockCallCount(
  mockFn: ReturnType<typeof vi.fn>,
  expectedCalls: number,
  options: WaitOptions = {}
): Promise<void> {
  await waitForCondition(
    () => mockFn.mock.calls.length === expectedCalls,
    {
      ...options,
      timeoutMessage: options.timeoutMessage || 
        `Expected ${expectedCalls} calls, but got ${mockFn.mock.calls.length}`
    }
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

// Re-export all utilities for convenience
export * from 'vitest';

// Export common patterns as defaults
export default {
  waitFor,
  waitForCondition,
  sleep,
  nextTick,
  createDelayedMock,
  createDelayedErrorMock,
  createSequentialMock,
  createEventualSuccessMock,
  createControlledPromise,
  createFetchMock,
  createSimpleFetchMock,
  advanceTimersAndWait,
  runAllTimersAndWait,
  expectMockCalledWith,
  expectMockCallCount
};