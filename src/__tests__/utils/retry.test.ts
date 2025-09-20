/**
 * Retry Utility Test Suite
 *
 * Tests for retry logic utility functions used for handling transient failures.
 *
 * @module tests/utils/retry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import retryUtils from '../../utils/retry';
import { createDelayedMock, createDelayedErrorMock, waitFor } from '../async-test-utils';

const { withRetry } = retryUtils;

describe('retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withRetry function', () => {
    it('should succeed on first attempt when operation succeeds', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValue('success');
      
      const result = await withRetry(mockOperation, { 
        baseDelayMs: 10,  // Short delay for testing
        operationName: 'test operation'
      });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(withRetry(mockOperation, { 
        maxAttempts: 3,
        baseDelayMs: 10,
        operationName: 'failing operation'
      })).rejects.toThrow('failing operation failed after 3 attempts');
      
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should use default options when none provided', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');
      
      const result = await withRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should use custom max attempts', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(withRetry(mockOperation, { 
        maxAttempts: 2,
        baseDelayMs: 10,
        operationName: 'custom max attempts'
      })).rejects.toThrow('custom max attempts failed after 2 attempts');
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should respect base delay between attempts', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await withRetry(mockOperation, { 
        baseDelayMs: 50,
        operationName: 'delay test'
      });
      const elapsed = Date.now() - startTime;
      
      // Should have waited at least 50ms for the retry
      expect(elapsed).toBeGreaterThan(45); // Allow some tolerance
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should implement linear backoff', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delays
      global.setTimeout = vi.fn().mockImplementation((callback, delay) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0); // Execute immediately for testing
      });
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      await withRetry(mockOperation, { 
        baseDelayMs: 100,
        operationName: 'backoff test'
      });
      
      // Should have linear backoff: 100ms, 200ms
      expect(delays).toEqual([100, 200]);
      
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should handle operation that throws non-Error objects', async () => {
      const mockOperation = vi.fn().mockRejectedValue('string error');
      
      await expect(withRetry(mockOperation, { 
        maxAttempts: 2,
        baseDelayMs: 10,
        operationName: 'string error test'
      })).rejects.toThrow('string error test failed after 2 attempts');
    });

    it('should preserve original error in the final error', async () => {
      const originalError = new Error('Original error message');
      const mockOperation = vi.fn().mockRejectedValue(originalError);
      
      try {
        await withRetry(mockOperation, { 
          maxAttempts: 2,
          baseDelayMs: 10,
          operationName: 'error preservation test'
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Original error message');
        expect((error as Error).cause).toBe(originalError);
      }
    });

    it('should handle async operations that return different types', async () => {
      // Test with object return type
      const objectOperation = vi.fn().mockResolvedValue({ data: 'test', id: 123 });
      const objectResult = await withRetry(objectOperation);
      expect(objectResult).toEqual({ data: 'test', id: 123 });
      
      // Test with array return type
      const arrayOperation = vi.fn().mockResolvedValue([1, 2, 3]);
      const arrayResult = await withRetry(arrayOperation);
      expect(arrayResult).toEqual([1, 2, 3]);
      
      // Test with null return type
      const nullOperation = vi.fn().mockResolvedValue(null);
      const nullResult = await withRetry(nullOperation);
      expect(nullResult).toBeNull();
    });

    it('should work with real async operations', async () => {
      let attemptCount = 0;
      const flakeyOperation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return `Success on attempt ${attemptCount}`;
      };
      
      const result = await withRetry(flakeyOperation, { 
        baseDelayMs: 10,
        operationName: 'flakey operation'
      });
      
      expect(result).toBe('Success on attempt 3');
      expect(attemptCount).toBe(3);
    });
  });

  describe('retryUtils default export', () => {
    it('should export withRetry function', () => {
      expect(retryUtils.withRetry).toBeDefined();
      expect(typeof retryUtils.withRetry).toBe('function');
    });

    it('should work through default export', async () => {
      const mockOperation = vi.fn().mockResolvedValue('exported success');
      
      const result = await retryUtils.withRetry(mockOperation);
      
      expect(result).toBe('exported success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle maxAttempts of 1', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Single attempt failure'));
      
      await expect(withRetry(mockOperation, { 
        maxAttempts: 1,
        operationName: 'single attempt'
      })).rejects.toThrow('single attempt failed after 1 attempts');
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle baseDelayMs of 0', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      const result = await withRetry(mockOperation, { 
        baseDelayMs: 0,
        operationName: 'no delay test'
      });
      const elapsed = Date.now() - startTime;
      
      expect(result).toBe('success');
      expect(elapsed).toBeLessThan(50); // Should be very fast with no delay
    });

    it('should handle very large maxAttempts', async () => {
      const mockOperation = vi.fn().mockResolvedValue('immediate success');
      
      const result = await withRetry(mockOperation, { 
        maxAttempts: 1000,
        operationName: 'large max attempts'
      });
      
      expect(result).toBe('immediate success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle API request simulation', async () => {
      let callCount = 0;
      const simulateApiCall = async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network timeout');
        }
        return { data: 'API response', status: 200 };
      };
      
      const result = await withRetry(simulateApiCall, {
        baseDelayMs: 10,
        operationName: 'API request'
      });
      
      expect(result).toEqual({ data: 'API response', status: 200 });
      expect(callCount).toBe(3);
    });

    it('should handle database operation simulation', async () => {
      let connectionAttempts = 0;
      const simulateDbOperation = async () => {
        connectionAttempts++;
        if (connectionAttempts < 2) {
          throw new Error('Connection refused');
        }
        return { id: 'user123', name: 'Test User' };
      };
      
      const result = await withRetry(simulateDbOperation, {
        baseDelayMs: 5,
        operationName: 'Database query'
      });
      
      expect(result).toEqual({ id: 'user123', name: 'Test User' });
      expect(connectionAttempts).toBe(2);
    });

    it('should handle file operation simulation', async () => {
      let readAttempts = 0;
      const simulateFileRead = async () => {
        readAttempts++;
        if (readAttempts === 1) {
          throw new Error('File locked');
        }
        if (readAttempts === 2) {
          throw new Error('Permission denied');
        }
        return 'file content';
      };
      
      const result = await withRetry(simulateFileRead, {
        baseDelayMs: 1,
        maxAttempts: 5,
        operationName: 'File read'
      });
      
      expect(result).toBe('file content');
      expect(readAttempts).toBe(3);
    });
  });
});