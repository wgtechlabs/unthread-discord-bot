/**
 * Test Suite: Default Configuration System
 *
 * Comprehensive tests for the defaults configuration module.
 * Tests cover environment detection, configuration parsing, SSL config, and Railway detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	DEFAULT_CONFIG,
	getConfig,
	getAllConfig,
	isRailwayEnvironment,
	getSSLConfig,
	isDevelopment,
} from '@config/defaults';

describe('defaults configuration', () => {
	// Store original environment variables
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('DEFAULT_CONFIG', () => {
		it('should have production-safe defaults', () => {
			expect(DEFAULT_CONFIG.NODE_ENV).toBe('production');
			expect(DEFAULT_CONFIG.PORT).toBe(3000);
			expect(DEFAULT_CONFIG.DATABASE_SSL_VALIDATE).toBe(true);
		});

		it('should have sensible timeout values', () => {
			expect(DEFAULT_CONFIG.UNTHREAD_HTTP_TIMEOUT_MS).toBe(10000);
			expect(DEFAULT_CONFIG.WEBHOOK_POLL_INTERVAL).toBe(1000);
			expect(DEFAULT_CONFIG.UNTHREAD_DEFAULT_PRIORITY).toBe(5);
		});

		it('should have correct DUMMY_EMAIL_DOMAIN', () => {
			expect(DEFAULT_CONFIG.DUMMY_EMAIL_DOMAIN).toBe('discord.invalid');
		});
	});

	describe('isDevelopment', () => {
		it('should be a boolean value', () => {
			expect(typeof isDevelopment).toBe('boolean');
		});

		it('should be computed at module load time', () => {
			// Since isDevelopment is computed when the module loads,
			// we can only test its current value, not change NODE_ENV and expect it to update
			expect(isDevelopment).toBeDefined();
		});
	});

	describe('getConfig', () => {
		describe('String Configuration', () => {
			it('should return environment value when set', () => {
				process.env.TEST_STRING = 'env-value';

				const result = getConfig('TEST_STRING', 'default-value');

				expect(result).toBe('env-value');
			});

			it('should return default value when environment not set', () => {
				delete process.env.TEST_STRING;

				const result = getConfig('TEST_STRING', 'default-value');

				expect(result).toBe('default-value');
			});

			it('should handle empty string environment values', () => {
				process.env.TEST_STRING = '';

				const result = getConfig('TEST_STRING', 'default-value');

				expect(result).toBe('');
			});

			it('should handle special characters in strings', () => {
				process.env.TEST_STRING = 'special!@#$%^&*()_+{}|:"<>?[]\\;\',./ chars';

				const result = getConfig('TEST_STRING', 'default');

				expect(result).toBe('special!@#$%^&*()_+{}|:"<>?[]\\;\',./ chars');
			});
		});

		describe('Number Configuration', () => {
			it('should parse valid integer environment values', () => {
				process.env.TEST_NUMBER = '42';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(42);
				expect(typeof result).toBe('number');
			});

			it('should parse negative integer environment values', () => {
				process.env.TEST_NUMBER = '-50';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(-50);
			});

			it('should parse zero value correctly', () => {
				process.env.TEST_NUMBER = '0';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(0);
			});

			it('should return default for invalid number strings', () => {
				process.env.TEST_NUMBER = 'not-a-number';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(100);
			});

			it('should return default for empty number strings', () => {
				process.env.TEST_NUMBER = '';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(100);
			});

			it('should handle floating point strings by truncating', () => {
				process.env.TEST_NUMBER = '42.7';

				const result = getConfig('TEST_NUMBER', 100);

				// parseInt truncates
				expect(result).toBe(42);
			});

			it('should handle whitespace in number strings', () => {
				process.env.TEST_NUMBER = '  42  ';

				const result = getConfig('TEST_NUMBER', 100);

				expect(result).toBe(42);
			});
		});

		describe('Boolean Configuration', () => {
			it('should parse "true" string as true', () => {
				process.env.TEST_BOOLEAN = 'true';

				const result = getConfig('TEST_BOOLEAN', false);

				expect(result).toBe(true);
				expect(typeof result).toBe('boolean');
			});

			it('should parse "TRUE" string as true (case insensitive)', () => {
				process.env.TEST_BOOLEAN = 'TRUE';

				const result = getConfig('TEST_BOOLEAN', false);

				expect(result).toBe(true);
			});

			it('should parse "True" string as true (mixed case)', () => {
				process.env.TEST_BOOLEAN = 'True';

				const result = getConfig('TEST_BOOLEAN', false);

				expect(result).toBe(true);
			});

			it('should parse "false" string as false', () => {
				process.env.TEST_BOOLEAN = 'false';

				const result = getConfig('TEST_BOOLEAN', true);

				expect(result).toBe(false);
			});

			it('should parse any non-true string as false', () => {
				const falseValues = ['false', 'no', 'off', '0', '', 'random-string'];

				// Test each false value
				for (const value of falseValues) {
					process.env.TEST_BOOLEAN = value;
					const result = getConfig('TEST_BOOLEAN', true);
					expect(result).toBe(false);
				}
			});

			it('should return default when boolean environment not set', () => {
				delete process.env.TEST_BOOLEAN;

				const result = getConfig('TEST_BOOLEAN', true);

				expect(result).toBe(true);
			});
		});

		describe('Type Safety', () => {
			it('should maintain type consistency with defaults', () => {
				// String default should return string
				const stringResult = getConfig('TEST_STRING', 'default');
				expect(typeof stringResult).toBe('string');

				// Number default should return number
				const numberResult = getConfig('TEST_NUMBER', 42);
				expect(typeof numberResult).toBe('number');

				// Boolean default should return boolean
				const booleanResult = getConfig('TEST_BOOLEAN', true);
				expect(typeof booleanResult).toBe('boolean');
			});

			it('should handle complex default values', () => {
				const complexDefault = { key: 'value' };
				process.env.TEST_COMPLEX = 'string-value';

				const result = getConfig('TEST_COMPLEX', complexDefault);

				expect(result).toBe('string-value');
			});
		});
	});

	describe('getAllConfig', () => {
    it('should return all default configuration values', () => {
      // Temporarily clear NODE_ENV to test defaults
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

			try {
				const config = getAllConfig();

				expect(config.NODE_ENV).toBe('production');
				expect(config.PORT).toBe(3000);
				expect(config.UNTHREAD_HTTP_TIMEOUT_MS).toBe(10000);
				expect(config.WEBHOOK_POLL_INTERVAL).toBe(1000);
				expect(config.UNTHREAD_DEFAULT_PRIORITY).toBe(5);
				expect(config.DUMMY_EMAIL_DOMAIN).toBe('discord.invalid');
				expect(config.DATABASE_SSL_VALIDATE).toBe(true);
				expect(typeof config.isDevelopment).toBe('boolean');
			}
			finally {
				// Restore original NODE_ENV
				if (originalNodeEnv !== undefined) {
					process.env.NODE_ENV = originalNodeEnv;
				}
			}
		});

		it('should respect environment overrides', () => {
			// Save original environment variable values
			const originalNodeEnv = process.env.NODE_ENV;
			const originalPort = process.env.PORT;
			const originalTimeout = process.env.UNTHREAD_HTTP_TIMEOUT_MS;

			process.env.NODE_ENV = 'development';
			process.env.PORT = '4000';
			process.env.UNTHREAD_HTTP_TIMEOUT_MS = '15000';

			try {
				const config = getAllConfig();

				expect(config.NODE_ENV).toBe('development');
				expect(config.PORT).toBe(4000);
				expect(config.UNTHREAD_HTTP_TIMEOUT_MS).toBe(15000);

				// Non-overridden values should remain default
				expect(config.WEBHOOK_POLL_INTERVAL).toBe(1000);
				expect(config.DUMMY_EMAIL_DOMAIN).toBe('discord.invalid');
			}
			finally {
				// Restore original environment variable values
				if (originalNodeEnv !== undefined) {
					process.env.NODE_ENV = originalNodeEnv;
				}
				else {
					delete process.env.NODE_ENV;
				}
				if (originalPort !== undefined) {
					process.env.PORT = originalPort;
				}
				else {
					delete process.env.PORT;
				}
				if (originalTimeout !== undefined) {
					process.env.UNTHREAD_HTTP_TIMEOUT_MS = originalTimeout;
				}
				else {
					delete process.env.UNTHREAD_HTTP_TIMEOUT_MS;
				}
			}
		});

		it('should include isDevelopment boolean', () => {
			const config = getAllConfig();

			expect(typeof config.isDevelopment).toBe('boolean');
			expect(config.isDevelopment).toBe(isDevelopment);
		});

		it('should handle mixed environment overrides', () => {
			// Temporarily clear NODE_ENV and set specific overrides
			const originalNodeEnv = process.env.NODE_ENV;
			delete process.env.NODE_ENV;

			process.env.PORT = '8080';
			process.env.DATABASE_SSL_VALIDATE = 'false';
			process.env.DUMMY_EMAIL_DOMAIN = 'custom.domain';

			try {
				const config = getAllConfig();

				expect(config.PORT).toBe(8080);
				expect(config.DATABASE_SSL_VALIDATE).toBe(false);
				expect(config.DUMMY_EMAIL_DOMAIN).toBe('custom.domain');

				// Non-overridden should remain default
				expect(config.NODE_ENV).toBe('production');
				expect(config.UNTHREAD_HTTP_TIMEOUT_MS).toBe(10000);
			}
			finally {
				// Cleanup
				delete process.env.PORT;
				delete process.env.DATABASE_SSL_VALIDATE;
				delete process.env.DUMMY_EMAIL_DOMAIN;

				// Restore original NODE_ENV
				if (originalNodeEnv !== undefined) {
					process.env.NODE_ENV = originalNodeEnv;
				}
			}
		});
	});

	describe('isRailwayEnvironment', () => {
		it('should return false when no Railway URLs are set', () => {
			delete process.env.PLATFORM_REDIS_URL;
			delete process.env.WEBHOOK_REDIS_URL;
			delete process.env.POSTGRES_URL;

			expect(isRailwayEnvironment()).toBe(false);
		});

		it('should detect Railway from PLATFORM_REDIS_URL', () => {
			process.env.PLATFORM_REDIS_URL = 'redis://user:pass@redis.railway.internal:6379';

			expect(isRailwayEnvironment()).toBe(true);
		});

		it('should detect Railway from WEBHOOK_REDIS_URL', () => {
			process.env.WEBHOOK_REDIS_URL = 'redis://cache.railway.internal:6379/0';

			expect(isRailwayEnvironment()).toBe(true);
		});

		it('should detect Railway from POSTGRES_URL', () => {
			process.env.POSTGRES_URL = 'postgresql://user:pass@postgres.railway.internal:5432/db';

			expect(isRailwayEnvironment()).toBe(true);
		});

		it('should handle case-insensitive Railway detection', () => {
			process.env.PLATFORM_REDIS_URL = 'redis://user:pass@Redis.RAILWAY.INTERNAL:6379';

			expect(isRailwayEnvironment()).toBe(true);
		});

		it('should return false for non-Railway URLs', () => {
			process.env.PLATFORM_REDIS_URL = 'redis://localhost:6379';
			process.env.WEBHOOK_REDIS_URL = 'redis://redis.example.com:6379';
			process.env.POSTGRES_URL = 'postgresql://postgres:5432/db';

			expect(isRailwayEnvironment()).toBe(false);
		});

		it('should handle invalid URLs gracefully', () => {
			process.env.PLATFORM_REDIS_URL = 'not-a-valid-url';
			process.env.WEBHOOK_REDIS_URL = 'invalid://url//format';

			expect(isRailwayEnvironment()).toBe(false);
		});

		it('should handle empty string URLs', () => {
			process.env.PLATFORM_REDIS_URL = '';
			process.env.WEBHOOK_REDIS_URL = '   ';

			expect(isRailwayEnvironment()).toBe(false);
		});

		it('should detect Railway when mixed with non-Railway URLs', () => {
			process.env.PLATFORM_REDIS_URL = 'redis://localhost:6379';
			process.env.WEBHOOK_REDIS_URL = 'redis://cache.railway.internal:6379';
			process.env.POSTGRES_URL = 'postgresql://postgres.example.com:5432/db';

			expect(isRailwayEnvironment()).toBe(true);
		});
	});

	describe('getSSLConfig', () => {
		it('should return SSL config for production by default', () => {
			delete process.env.DATABASE_SSL_VALIDATE;

			const config = getSSLConfig(true);

			expect(config).toEqual({ rejectUnauthorized: false });
		});

		it('should return SSL config for development by default', () => {
			delete process.env.DATABASE_SSL_VALIDATE;

			const config = getSSLConfig(false);

			expect(config).toEqual({ rejectUnauthorized: false });
		});

		it('should disable SSL when DATABASE_SSL_VALIDATE is "full"', () => {
			process.env.DATABASE_SSL_VALIDATE = 'full';

			const productionConfig = getSSLConfig(true);
			const developmentConfig = getSSLConfig(false);

			expect(productionConfig).toBe(false);
			expect(developmentConfig).toBe(false);
		});

		it('should handle case sensitivity in SSL validation', () => {
			process.env.DATABASE_SSL_VALIDATE = 'FULL';

			const config = getSSLConfig(true);

			// Should not match due to case sensitivity
			expect(config).toEqual({ rejectUnauthorized: false });
		});

		it('should return SSL config for any non-"full" value', () => {
			const testValues = ['partial', 'none', 'invalid', ''];

			testValues.forEach(value => {
				process.env.DATABASE_SSL_VALIDATE = value;

				const config = getSSLConfig(true);

				// Any non-'full' value falls back to default behavior
				expect(config).toEqual({ rejectUnauthorized: false });
			});

			delete process.env.DATABASE_SSL_VALIDATE;
		});

		it('should be consistent regardless of production flag when not "full"', () => {
			process.env.DATABASE_SSL_VALIDATE = 'true';

			const prodConfig = getSSLConfig(true);
			const devConfig = getSSLConfig(false);

			expect(prodConfig).toEqual(devConfig);
			expect(prodConfig).toEqual({ rejectUnauthorized: false });
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should handle undefined process.env gracefully', () => {
			const originalProcessEnv = process.env;

			try {
				// This would be unusual but test resilience
				(process as any).env = undefined;

				expect(() => getConfig('TEST_KEY', 'default')).not.toThrow();
			}
			finally {
				process.env = originalProcessEnv;
			}
		});

		it('should handle special environment variable names', () => {
			process.env['SPECIAL-KEY'] = 'special-value';
			process.env['key.with.dots'] = 'dot-value';
			process.env['KEY_WITH_UNDERSCORES'] = 'underscore-value';

			expect(getConfig('SPECIAL-KEY', 'default')).toBe('special-value');
			expect(getConfig('key.with.dots', 'default')).toBe('dot-value');
			expect(getConfig('KEY_WITH_UNDERSCORES', 'default')).toBe('underscore-value');
		});

		it('should handle very large number strings', () => {
			process.env.LARGE_NUMBER = '999999999999999999999';

			const result = getConfig('LARGE_NUMBER', 100);

			// Should parse as number (might overflow to Infinity)
			expect(typeof result).toBe('number');
		});

		it('should be performant with repeated calls', () => {
			process.env.PERF_TEST = 'value';

			const iterations = 1000;
			const start = Date.now();

			for (let i = 0; i < iterations; i++) {
				getConfig('PERF_TEST', 'default');
			}

			const elapsed = Date.now() - start;

			// Should complete quickly (generous threshold for CI environments)
			expect(elapsed).toBeLessThan(100);
		});
	});
});