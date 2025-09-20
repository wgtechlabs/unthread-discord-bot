/**
 * Configuration Defaults Test Suite
 *
 * Tests for default configuration system including environment detection,
 * SSL configuration, and Railway platform detection.
 *
 * @module tests/config/defaults
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_CONFIG,
  getConfig,
  getAllConfig,
  isRailwayEnvironment,
  getSSLConfig,
  processConnectionString,
} from '../../config/defaults';

describe('defaults', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have production-safe defaults', () => {
      expect(DEFAULT_CONFIG.NODE_ENV).toBe('production');
      expect(DEFAULT_CONFIG.PORT).toBe(3000);
      expect(DEFAULT_CONFIG.UNTHREAD_HTTP_TIMEOUT_MS).toBe(10000);
      expect(DEFAULT_CONFIG.WEBHOOK_POLL_INTERVAL).toBe(1000);
    });

    it('should have sensible business logic defaults', () => {
      expect(DEFAULT_CONFIG.UNTHREAD_DEFAULT_PRIORITY).toBe(5);
      expect(DEFAULT_CONFIG.DUMMY_EMAIL_DOMAIN).toBe('discord.user');
      expect(DEFAULT_CONFIG.DATABASE_SSL_VALIDATE).toBe(true);
    });

    it('should detect development environment correctly', () => {
      // Test development detection
      process.env.NODE_ENV = 'development';
      expect(DEFAULT_CONFIG.isDevelopment()).toBe(true);

      // Test production detection
      process.env.NODE_ENV = 'production';
      expect(DEFAULT_CONFIG.isDevelopment()).toBe(false);

      // Test default when NODE_ENV is not set
      delete process.env.NODE_ENV;
      expect(DEFAULT_CONFIG.isDevelopment()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return environment value when set', () => {
      process.env.TEST_PORT = '8080';
      expect(getConfig('TEST_PORT', 3000)).toBe(8080);
    });

    it('should return default value when environment variable is not set', () => {
      delete process.env.TEST_PORT;
      expect(getConfig('TEST_PORT', 3000)).toBe(3000);
    });

    it('should parse numeric values correctly', () => {
      process.env.TEST_NUMBER = '42';
      expect(getConfig('TEST_NUMBER', 10)).toBe(42);

      process.env.TEST_INVALID_NUMBER = 'not-a-number';
      expect(getConfig('TEST_INVALID_NUMBER', 10)).toBe(10);
    });

    it('should parse boolean values correctly', () => {
      process.env.TEST_BOOL_TRUE = 'true';
      expect(getConfig('TEST_BOOL_TRUE', false)).toBe(true);

      process.env.TEST_BOOL_FALSE = 'false';
      expect(getConfig('TEST_BOOL_FALSE', true)).toBe(false);

      process.env.TEST_BOOL_INVALID = 'not-a-boolean';
      expect(getConfig('TEST_BOOL_INVALID', true)).toBe(false);
    });

    it('should return string values as-is', () => {
      process.env.TEST_STRING = 'hello world';
      expect(getConfig('TEST_STRING', 'default')).toBe('hello world');
    });
  });

  describe('getAllConfig', () => {
    it('should return all configuration with defaults', () => {
      // Reset NODE_ENV for this test since setup sets it to 'test'
      delete process.env.NODE_ENV;
      
      const config = getAllConfig();
      
      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(3000);
      expect(config.UNTHREAD_HTTP_TIMEOUT_MS).toBe(10000);
      expect(typeof config.isDevelopment).toBe('function');
    });

    it('should override defaults with environment variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '8080';
      
      const config = getAllConfig();
      
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(8080);
    });
  });

  describe('isRailwayEnvironment', () => {
    it('should return false when no Railway URLs are present', () => {
      delete process.env.PLATFORM_REDIS_URL;
      delete process.env.WEBHOOK_REDIS_URL;
      delete process.env.POSTGRES_URL;
      
      expect(isRailwayEnvironment()).toBe(false);
    });

    it('should detect Railway platform from PLATFORM_REDIS_URL', () => {
      process.env.PLATFORM_REDIS_URL = 'redis://default:password@redis.railway.internal:6379';
      expect(isRailwayEnvironment()).toBe(true);
    });

    it('should detect Railway platform from WEBHOOK_REDIS_URL', () => {
      process.env.WEBHOOK_REDIS_URL = 'redis://user:pass@redis.railway.internal:6379';
      expect(isRailwayEnvironment()).toBe(true);
    });

    it('should detect Railway platform from POSTGRES_URL', () => {
      process.env.POSTGRES_URL = 'postgresql://user:pass@postgres.railway.internal:5432/db';
      expect(isRailwayEnvironment()).toBe(true);
    });

    it('should handle invalid URLs gracefully', () => {
      process.env.PLATFORM_REDIS_URL = 'invalid-url';
      expect(isRailwayEnvironment()).toBe(false);
    });

    it('should handle empty URLs', () => {
      process.env.PLATFORM_REDIS_URL = '';
      process.env.WEBHOOK_REDIS_URL = '   ';
      expect(isRailwayEnvironment()).toBe(false);
    });
  });

  describe('getSSLConfig', () => {
    beforeEach(() => {
      delete process.env.DATABASE_SSL_VALIDATE;
      delete process.env.DATABASE_SSL_CA;
      delete process.env.PLATFORM_REDIS_URL;
      delete process.env.WEBHOOK_REDIS_URL;
      delete process.env.POSTGRES_URL;
    });

    it('should disable SSL when DATABASE_SSL_VALIDATE is "full"', () => {
      process.env.DATABASE_SSL_VALIDATE = 'full';
      expect(getSSLConfig(true)).toBe(false);
      expect(getSSLConfig(false)).toBe(false);
    });

    it('should configure SSL for Railway environment', () => {
      process.env.PLATFORM_REDIS_URL = 'redis://redis.railway.internal:6379';
      
      const sslConfig = getSSLConfig(true);
      expect(sslConfig).toEqual({ rejectUnauthorized: false });
    });

    it('should include CA certificate for Railway when provided', () => {
      process.env.PLATFORM_REDIS_URL = 'redis://redis.railway.internal:6379';
      process.env.DATABASE_SSL_CA = 'test-ca-cert';
      
      const sslConfig = getSSLConfig(true);
      expect(sslConfig).toEqual({
        rejectUnauthorized: false,
        ca: 'test-ca-cert',
      });
    });

    it('should validate SSL certificates in production by default', () => {
      const sslConfig = getSSLConfig(true);
      expect(sslConfig).toEqual({ rejectUnauthorized: true });
    });

    it('should handle development environment SSL settings', () => {
      process.env.DATABASE_SSL_VALIDATE = 'true';
      
      const sslConfig = getSSLConfig(false);
      expect(sslConfig).toEqual({ rejectUnauthorized: false });
    });

    it('should validate certificates when DATABASE_SSL_VALIDATE is "false"', () => {
      process.env.DATABASE_SSL_VALIDATE = 'false';
      
      const sslConfig = getSSLConfig(false);
      expect(sslConfig).toEqual({ rejectUnauthorized: true });
    });
  });

  describe('processConnectionString', () => {
    it('should add sslmode=disable when SSL is completely disabled', () => {
      const connectionString = 'postgresql://user:pass@host:5432/db';
      const result = processConnectionString(connectionString, false);
      
      expect(result).toBe('postgresql://user:pass@host:5432/db?sslmode=disable');
    });

    it('should append to existing query parameters', () => {
      const connectionString = 'postgresql://user:pass@host:5432/db?timeout=10';
      const result = processConnectionString(connectionString, false);
      
      expect(result).toBe('postgresql://user:pass@host:5432/db?timeout=10&sslmode=disable');
    });

    it('should not modify connection string when SSL is enabled', () => {
      const connectionString = 'postgresql://user:pass@host:5432/db';
      const sslConfig = { rejectUnauthorized: true };
      const result = processConnectionString(connectionString, sslConfig);
      
      expect(result).toBe(connectionString);
    });

    it('should not add sslmode if already present', () => {
      const connectionString = 'postgresql://user:pass@host:5432/db?sslmode=require';
      const result = processConnectionString(connectionString, false);
      
      expect(result).toBe(connectionString);
    });

    it('should handle connection string with credentials (masking test)', () => {
      // This test ensures the function handles credentials properly
      // The actual masking is done in console.log, which is mocked in setup
      const connectionString = 'postgresql://username:password@host:5432/db';
      const result = processConnectionString(connectionString, false);
      
      expect(result).toBe('postgresql://username:password@host:5432/db?sslmode=disable');
    });
  });

  describe('integration tests', () => {
    it('should work together for Railway production environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.PLATFORM_REDIS_URL = 'redis://redis.railway.internal:6379';
      process.env.DATABASE_SSL_CA = 'railway-ca-cert';
      
      const isRailway = isRailwayEnvironment();
      const sslConfig = getSSLConfig(true);
      const config = getAllConfig();
      
      expect(isRailway).toBe(true);
      expect(sslConfig).toEqual({
        rejectUnauthorized: false,
        ca: 'railway-ca-cert',
      });
      expect(config.NODE_ENV).toBe('production');
      expect(config.isDevelopment()).toBe(false);
    });

    it('should work for local development environment', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '3001';
      delete process.env.PLATFORM_REDIS_URL;
      
      const isRailway = isRailwayEnvironment();
      const sslConfig = getSSLConfig(false);
      const config = getAllConfig();
      
      expect(isRailway).toBe(false);
      expect(sslConfig).toEqual({ rejectUnauthorized: true });
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3001);
      expect(config.isDevelopment()).toBe(true);
    });
  });
});