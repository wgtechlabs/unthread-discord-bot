/**
 * Default Configuration System
 *
 * Provides production-safe defaults for the Discord bot configuration.
 * This follows Node.js best practices by using NODE_ENV for environment detection
 * and hardcoding sensible defaults that don't require user configuration.
 *
 * Configuration Philosophy:
 * - Required vars: Only those that MUST be set by users (tokens, URLs, IDs)
 * - Default configs: Hardcoded sensible defaults in this file
 * - Optional overrides: Environment can override defaults when needed
 *
 * @module config/defaults
 */

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
	DUMMY_EMAIL_DOMAIN: 'discord.user',
	DATABASE_SSL_VALIDATE: true,

	// Environment detection helper
	isDevelopment: (): boolean => process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
} as const;

/**
 * Get configuration value with environment override support
 * @param key - Configuration key (environment variable name)
 * @param defaultValue - Default value if environment variable is not set
 * @returns Configuration value with type safety
 */
export function getConfig<T>(key: string, defaultValue: T): T {
	const envValue = process.env[key];

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
		isDevelopment: DEFAULT_CONFIG.isDevelopment,
	};
}