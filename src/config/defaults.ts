/**
 * Default Configuration System
 *
 * Provides production-safe defaults for the Discord bot configuration.
 * This follows Node.js best practices by using NODE_ENV for environment detection
 * and hardcoding sensible defaults that don't require user configuration.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This module centralizes all default values to ensure consistency across
 * the application. When adding new configurable features, add defaults here
 * rather than hardcoding values throughout the codebase.
 *
 * Configuration Philosophy:
 * - Required vars: Only those that MUST be set by users (tokens, URLs, IDs)
 * - Default configs: Hardcoded sensible defaults in this file
 * - Optional overrides: Environment can override defaults when needed
 *
 * 🔧 ADDING NEW CONFIG:
 * ====================
 * 1. Add the default value to DEFAULT_CONFIG object
 * 2. Add environment variable parsing in getConfig() if needed
 * 3. Update .env.example with the new variable
 * 4. Document the new configuration option
 *
 * 🛠️ ENVIRONMENT DETECTION:
 * =========================
 * - NODE_ENV=development: Enables debug logging, relaxed validation
 * - NODE_ENV=production: Info-level logging, strict validation
 * - NODE_ENV=test: Special handling for test scenarios
 *
 * @module config/defaults
 */

import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Default configuration values for the Discord bot
 */
export const DEFAULT_CONFIG = {
	// Production-safe defaults
	NODE_ENV: 'production',
	PORT: 3000,

	// Timeouts & Performance (hardcoded - no env needed)
	UNTHREAD_HTTP_TIMEOUT_MS: 10000,
	WEBHOOK_POLL_INTERVAL: 1000,

	// Business Logic (sensible defaults)
	UNTHREAD_DEFAULT_PRIORITY: 5,
	DUMMY_EMAIL_DOMAIN: 'discord.invalid',
	DATABASE_SSL_VALIDATE: true,
} as const;

/**
 * Environment detection helper - computed at module load time
 */
export const isDevelopment: boolean = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * Get configuration value with environment override support
 * @param key - Configuration key (environment variable name)
 * @param defaultValue - Default value if environment variable is not set
 * @returns Configuration value with type safety
 */
export function getConfig<T>(key: string, defaultValue: T): T {
	// Handle undefined process.env gracefully
	const env = process.env || {};
	const envValue = env[key as keyof NodeJS.ProcessEnv];

	if (envValue !== undefined) {
		// Try to parse numeric values
		if (typeof defaultValue === 'number') {
			const parsed = parseInt(envValue, 10);
			return (!isNaN(parsed) ? parsed : defaultValue) as T;
		}

		// Try to parse boolean values
		if (typeof defaultValue === 'boolean') {
			return (typeof envValue === 'string' && envValue.toLowerCase() === 'true') as T;
		}

		// Return string values as-is
		return envValue as T;
	}

	return defaultValue;
}

/**
 * Get all configuration with environment overrides applied
 */
export function getAllConfig() {
	return {
		NODE_ENV: getConfig('NODE_ENV', DEFAULT_CONFIG.NODE_ENV),
		PORT: getConfig('PORT', DEFAULT_CONFIG.PORT),
		UNTHREAD_HTTP_TIMEOUT_MS: getConfig('UNTHREAD_HTTP_TIMEOUT_MS', DEFAULT_CONFIG.UNTHREAD_HTTP_TIMEOUT_MS),
		WEBHOOK_POLL_INTERVAL: getConfig('WEBHOOK_POLL_INTERVAL', DEFAULT_CONFIG.WEBHOOK_POLL_INTERVAL),
		UNTHREAD_DEFAULT_PRIORITY: getConfig('UNTHREAD_DEFAULT_PRIORITY', DEFAULT_CONFIG.UNTHREAD_DEFAULT_PRIORITY),
		DUMMY_EMAIL_DOMAIN: getConfig('DUMMY_EMAIL_DOMAIN', DEFAULT_CONFIG.DUMMY_EMAIL_DOMAIN),
		DATABASE_SSL_VALIDATE: getConfig('DATABASE_SSL_VALIDATE', DEFAULT_CONFIG.DATABASE_SSL_VALIDATE),
		isDevelopment,
	};
}

/**
 * Check if running on Railway platform by examining service URLs
 */
export function isRailwayEnvironment(): boolean {
	const platformRedis = process.env.PLATFORM_REDIS_URL;
	const webhookRedis = process.env.WEBHOOK_REDIS_URL;
	const postgresUrl = process.env.POSTGRES_URL;

	const isRailwayHost = (url: string | undefined): boolean => {
		if (!url || url.trim() === '') {
			return false;
		}
		try {
			const parsedUrl = new URL(url);
			return parsedUrl.hostname.toLowerCase().includes('railway.internal');
		}
		catch {
			return false;
		}
	};

	return (
		isRailwayHost(platformRedis) ||
		isRailwayHost(webhookRedis) ||
		isRailwayHost(postgresUrl)
	);
}

/**
 * SSL configuration interface for PostgreSQL connections
 */
interface SSLConfig {
	rejectUnauthorized: boolean;
	ca?: string;
}

/**
 * Helper function to create SSL configuration with optional CA certificate
 * Eliminates code duplication in SSL configuration logic
 *
 * @param rejectUnauthorized - Whether to reject unauthorized certificates
 * @returns SSL configuration object with optional CA certificate
 */
function createSSLConfig(rejectUnauthorized: boolean): SSLConfig {
	const config: SSLConfig = {
		rejectUnauthorized,
	};
	if (process.env.DATABASE_SSL_CA) {
		config.ca = process.env.DATABASE_SSL_CA;
	}
	return config;
}

/**
 * Configure SSL settings for PostgreSQL connections based on environment
 * Production prioritizes security with strict SSL validation by default.
 * Development allows flexibility with explicit configuration overrides.
 *
 * @param isProduction - Whether running in production environment
 * @returns SSL configuration object, or false to disable SSL entirely (dev only)
 */
export function getSSLConfig(isProduction: boolean): SSLConfig | false {
	// Check SSL validation setting first
	const sslValidate = process.env.DATABASE_SSL_VALIDATE;

	// Check if we're on Railway first - they use self-signed certificates
	if (isRailwayEnvironment()) {
		return createSSLConfig(false);
	}

	// In production, enforce secure SSL by default
	if (isProduction) {
		// Only allow disabling SSL validation with explicit override (not complete SSL disable)
		if (sslValidate === 'false') {
			// SSL enabled, validation disabled
			return createSSLConfig(false);
		}

		// Production default: SSL enabled WITH strict certificate validation for security
		return createSSLConfig(true);
	}

	// In development, allow more flexibility for local development
	// Allow complete SSL disable only in development with 'full' setting
	if (sslValidate === 'full') {
		// No SSL at all (development only)
		return false;
	}

	// If set to 'true', enable SSL with strict validation
	if (sslValidate === 'true') {
		return createSSLConfig(true);
	}

	// If explicitly set to 'false', enable SSL but disable certificate validation (dev convenience)
	if (sslValidate === 'false') {
		return createSSLConfig(false);
	}

	// Development default: SSL enabled WITHOUT certificate validation for local convenience
	return createSSLConfig(false);
}

/**
 * Process PostgreSQL connection string with SSL configuration
 * Automatically adds sslmode=disable when SSL is completely disabled
 *
 * @param connectionString - Base PostgreSQL connection string
 * @param sslConfig - SSL configuration from getSSLConfig()
 * @returns Processed connection string with SSL parameters if needed
 */
export function processConnectionString(connectionString: string, sslConfig: SSLConfig | false): string {
	// Auto-append sslmode=disable only when completely disabling SSL
	if (sslConfig === false && !connectionString.includes('sslmode=')) {
		const separator = connectionString.includes('?') ? '&' : '?';
		const processedString = `${connectionString}${separator}sslmode=disable`;

		// Log SSL configuration change (mask credentials for security)
		const maskedUrl = connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
		const maskedProcessedUrl = processedString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');

		LogEngine.info('SSL disabled - added sslmode=disable to connection string', {
			originalUrl: maskedUrl,
			modifiedUrl: maskedProcessedUrl,
		});

		return processedString;
	}

	return connectionString;
}