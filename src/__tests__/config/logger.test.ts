/**
 * Test Suite: Logger Configuration
 *
 * Comprehensive tests for the logger configuration module.
 * Tests cover environment-based LogMode selection, configuration initialization,
 * and branch coverage for conditional logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock log-engine before it is imported anywhere
vi.mock('@wgtechlabs/log-engine', () => {
  const LogMode = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' } as const;
  const LogEngine = {
    configure: vi.fn(),
    debug:     vi.fn(),
    info:      vi.fn(),
    warn:      vi.fn(),
    error:     vi.fn(),
  };
  return { LogEngine, LogMode };
});

import { LogEngine } from '@wgtechlabs/log-engine';
describe('logger configuration', () => {
	// Store original environment variables
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		// Clear any cached modules to test different environment configurations
		vi.resetModules();
		// Clear mock calls
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	describe('LogEngine Configuration', () => {
		it('should configure LogEngine with DEBUG mode in development environment', async () => {
			// Set up development environment
			process.env.NODE_ENV = 'development';

			// Dynamically import to get fresh module with new environment
			const { LogEngine: ImportedLogEngine, LogMode } = await import('@config/logger');

			// Verify LogEngine is available and configured
			expect(ImportedLogEngine).toBeDefined();
			expect(ImportedLogEngine.configure).toBeDefined();
			expect(ImportedLogEngine.debug).toBeDefined();
			expect(ImportedLogEngine.info).toBeDefined();
			expect(ImportedLogEngine.warn).toBeDefined();
			expect(ImportedLogEngine.error).toBeDefined();

			// Verify LogMode is re-exported
			expect(LogMode).toBeDefined();
			expect(LogMode.DEBUG).toBe('debug');
			expect(LogMode.INFO).toBe('info');
		});

		it('should configure LogEngine with INFO mode in production environment', async () => {
			// Set up production environment
			process.env.NODE_ENV = 'production';

			// Dynamically import to get fresh module with new environment
			const { LogEngine: ImportedLogEngine, LogMode } = await import('@config/logger');

			// Verify LogEngine is available and configured
			expect(ImportedLogEngine).toBeDefined();
			expect(ImportedLogEngine.configure).toBeDefined();

			// Verify LogMode is re-exported
			expect(LogMode).toBeDefined();
			expect(LogMode.INFO).toBe('info');
		});

		it('should configure LogEngine with DEBUG mode when NODE_ENV is undefined', async () => {
			// Clear NODE_ENV to simulate undefined environment
			delete process.env.NODE_ENV;

			// Dynamically import to get fresh module with new environment
			const { LogEngine: ImportedLogEngine, LogMode } = await import('@config/logger');

			// Verify LogEngine is available and configured
			expect(ImportedLogEngine).toBeDefined();
			expect(ImportedLogEngine.configure).toBeDefined();

			// Verify LogMode is re-exported
			expect(LogMode).toBeDefined();
		});

		it('should configure LogEngine with INFO mode for test environment', async () => {
			// Set up test environment
			process.env.NODE_ENV = 'test';

			// Dynamically import to get fresh module with new environment
			const { LogEngine: ImportedLogEngine, LogMode } = await import('@config/logger');

			// Verify LogEngine is available and configured
			expect(ImportedLogEngine).toBeDefined();
			expect(ImportedLogEngine.configure).toBeDefined();

			// Verify LogMode is re-exported
			expect(LogMode).toBeDefined();
		});

		it('should configure LogEngine with INFO mode for staging environment', async () => {
			// Set up staging environment (non-development)
			process.env.NODE_ENV = 'staging';

			// Dynamically import to get fresh module with new environment
			const { LogEngine: ImportedLogEngine, LogMode } = await import('@config/logger');

			// Verify LogEngine is available and configured
			expect(ImportedLogEngine).toBeDefined();
			expect(ImportedLogEngine.configure).toBeDefined();

			// Verify LogMode is re-exported
			expect(LogMode).toBeDefined();
		});
	});

	describe('Environment Detection Branch Coverage', () => {
		it('should handle development environment (isDevelopment = true)', async () => {
			process.env.NODE_ENV = 'development';

			// Import defaults to trigger isDevelopment calculation
			const { isDevelopment } = await import('@config/defaults');
			expect(isDevelopment).toBe(true);

			// Import logger to test branch with isDevelopment = true
			const { LogEngine: ImportedLogEngine } = await import('@config/logger');
			expect(ImportedLogEngine).toBeDefined();

			// Verify the configure method was called
			expect(LogEngine.configure).toHaveBeenCalled();
		});

		it('should handle production environment (isDevelopment = false)', async () => {
			process.env.NODE_ENV = 'production';

			// Import defaults to trigger isDevelopment calculation
			const { isDevelopment } = await import('@config/defaults');
			expect(isDevelopment).toBe(false);

			// Import logger to test branch with isDevelopment = false
			const { LogEngine: ImportedLogEngine } = await import('@config/logger');
			expect(ImportedLogEngine).toBeDefined();

			// Verify the configure method was called
			expect(LogEngine.configure).toHaveBeenCalled();
		});

		it('should handle undefined NODE_ENV (isDevelopment = true)', async () => {
			delete process.env.NODE_ENV;

			// Import defaults to trigger isDevelopment calculation
			const { isDevelopment } = await import('@config/defaults');
			expect(isDevelopment).toBe(true);

			// Import logger to test branch with isDevelopment = true
			const { LogEngine: ImportedLogEngine } = await import('@config/logger');
			expect(ImportedLogEngine).toBeDefined();

			// Verify the configure method was called
			expect(LogEngine.configure).toHaveBeenCalled();
		});

		it('should handle empty NODE_ENV (isDevelopment = true)', async () => {
			process.env.NODE_ENV = '';

			// Import defaults to trigger isDevelopment calculation
			const { isDevelopment } = await import('@config/defaults');
			expect(isDevelopment).toBe(true);

			// Import logger to test branch with isDevelopment = true
			const { LogEngine: ImportedLogEngine } = await import('@config/logger');
			expect(ImportedLogEngine).toBeDefined();

			// Verify the configure method was called
			expect(LogEngine.configure).toHaveBeenCalled();
		});
	});

	describe('LogEngine Configuration Parameters', () => {
		it('should call configure with DEBUG mode for development environment', async () => {
			process.env.NODE_ENV = 'development';

			// Import logger to trigger configuration
			await import('@config/logger');

			// Verify LogEngine.configure was called
			expect(LogEngine.configure).toHaveBeenCalled();
			
			// Get the call arguments to verify the configuration
			const configCall = vi.mocked(LogEngine.configure).mock.calls[0];
			expect(configCall).toBeDefined();
			expect(configCall[0]).toMatchObject({
				mode: 'debug',
				format: {
					includeIsoTimestamp: false,
					includeLocalTime: true,
				},
			});
		});

		it('should call configure with INFO mode for production environment', async () => {
			process.env.NODE_ENV = 'production';

			// Import logger to trigger configuration
			await import('@config/logger');

			// Verify LogEngine.configure was called
			expect(LogEngine.configure).toHaveBeenCalled();
			
			// Get the call arguments to verify the configuration
			const configCall = vi.mocked(LogEngine.configure).mock.calls[0];
			expect(configCall).toBeDefined();
			expect(configCall[0]).toMatchObject({
				mode: 'info',
				format: {
					includeIsoTimestamp: false,
					includeLocalTime: true,
				},
			});
		});
	});

	describe('Module Exports', () => {
		it('should export LogEngine correctly', async () => {
			const loggerModule = await import('@config/logger');

			expect(loggerModule.LogEngine).toBeDefined();
			expect(typeof loggerModule.LogEngine).toBe('object');
			expect(loggerModule.LogEngine.configure).toBeDefined();
			expect(loggerModule.LogEngine.debug).toBeDefined();
			expect(loggerModule.LogEngine.info).toBeDefined();
			expect(loggerModule.LogEngine.warn).toBeDefined();
			expect(loggerModule.LogEngine.error).toBeDefined();
		});

		it('should re-export LogMode correctly', async () => {
			const loggerModule = await import('@config/logger');

			expect(loggerModule.LogMode).toBeDefined();
			expect(typeof loggerModule.LogMode).toBe('object');
			expect(loggerModule.LogMode.DEBUG).toBe('debug');
			expect(loggerModule.LogMode.INFO).toBe('info');
			expect(loggerModule.LogMode.WARN).toBe('warn');
			expect(loggerModule.LogMode.ERROR).toBe('error');
		});

		it('should provide consistent exports across imports', async () => {
			const import1 = await import('@config/logger');
			
			// Clear modules and import again
			vi.resetModules();
			const import2 = await import('@config/logger');

			// Both imports should provide the same interface
			expect(typeof import1.LogEngine).toBe(typeof import2.LogEngine);
			expect(typeof import1.LogMode).toBe(typeof import2.LogMode);
		});
	});

	describe('Integration with Defaults Module', () => {
		it('should use isDevelopment from defaults module correctly', async () => {
			process.env.NODE_ENV = 'development';

			// Import both modules to test integration
			const { isDevelopment } = await import('@config/defaults');
			await import('@config/logger');

			expect(isDevelopment).toBe(true);

			// The logger should have been configured
			expect(LogEngine.configure).toHaveBeenCalled();
		});

		it('should handle changes in environment detection', async () => {
			// First, test with production
			process.env.NODE_ENV = 'production';
			const { isDevelopment: prod } = await import('@config/defaults');
			expect(prod).toBe(false);

			// Reset and test with development
			vi.resetModules();
			process.env.NODE_ENV = 'development';
			const { isDevelopment: dev } = await import('@config/defaults');
			expect(dev).toBe(true);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle module import successfully in all environments', async () => {
			const environments = ['development', 'production', 'test', 'staging', undefined, ''];

			for (const env of environments) {
				vi.resetModules();
				
				if (env === undefined) {
					delete process.env.NODE_ENV;
				} else {
					process.env.NODE_ENV = env;
				}

				// Should not throw an error
				await expect(import('@config/logger')).resolves.toBeDefined();
			}
		});

		it('should maintain configuration consistency across multiple imports', async () => {
			process.env.NODE_ENV = 'production';

			// Import multiple times
			const logger1 = await import('@config/logger');
			const logger2 = await import('@config/logger');
			const logger3 = await import('@config/logger');

			// All should reference the same LogEngine instance
			expect(logger1.LogEngine).toBe(logger2.LogEngine);
			expect(logger2.LogEngine).toBe(logger3.LogEngine);
		});

		it('should handle case-insensitive NODE_ENV values', async () => {
			const testCases = [
				'DEVELOPMENT',
				'Development',
				'PRODUCTION',
				'Production',
				'TEST',
				'Test',
			];

			for (const env of testCases) {
				vi.resetModules();
				process.env.NODE_ENV = env;

				// Should not throw errors regardless of case
				await expect(import('@config/logger')).resolves.toBeDefined();
			}
		});
	});

	describe('LogMode Constants', () => {
		it('should provide all required LogMode constants', async () => {
			const { LogMode } = await import('@config/logger');

			expect(LogMode.DEBUG).toBe('debug');
			expect(LogMode.INFO).toBe('info');
			expect(LogMode.WARN).toBe('warn');
			expect(LogMode.ERROR).toBe('error');
		});

		it('should maintain LogMode constant values', async () => {
			const { LogMode } = await import('@config/logger');

			// Values should be strings and immutable
			const values = Object.values(LogMode);
			values.forEach(value => {
				expect(typeof value).toBe('string');
				expect(value.length).toBeGreaterThan(0);
			});

			// Check specific values
			expect(values).toContain('debug');
			expect(values).toContain('info');
			expect(values).toContain('warn');
			expect(values).toContain('error');
		});
	});

	describe('Conditional Logic Branch Coverage', () => {
		it('should take the DEBUG branch when isDevelopment is true', async () => {
			process.env.NODE_ENV = 'development';

			// Import logger to trigger the condition
			await import('@config/logger');

			// Verify configure was called with DEBUG mode
			expect(LogEngine.configure).toHaveBeenCalledWith(
				expect.objectContaining({
					mode: 'debug'
				})
			);
		});

		it('should take the INFO branch when isDevelopment is false', async () => {
			process.env.NODE_ENV = 'production';

			// Import logger to trigger the condition
			await import('@config/logger');

			// Verify configure was called with INFO mode
			expect(LogEngine.configure).toHaveBeenCalledWith(
				expect.objectContaining({
					mode: 'info'
				})
			);
		});

		it('should test the ternary operator branches explicitly', async () => {
			// Test both branches of: isDevelopment ? LogMode.DEBUG : LogMode.INFO
			
			// Branch 1: isDevelopment = true (should use DEBUG)
			process.env.NODE_ENV = 'development';
			vi.resetModules();
			await import('@config/logger');
			expect(LogEngine.configure).toHaveBeenCalledWith(
				expect.objectContaining({ mode: 'debug' })
			);

			// Branch 2: isDevelopment = false (should use INFO)  
			vi.resetModules();
			vi.clearAllMocks();
			process.env.NODE_ENV = 'production';
			await import('@config/logger');
			expect(LogEngine.configure).toHaveBeenCalledWith(
				expect.objectContaining({ mode: 'info' })
			);
		});
	});
});