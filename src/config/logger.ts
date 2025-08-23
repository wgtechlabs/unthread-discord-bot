/**
 * Log Engine Configuration
 * 
 * Configures @wgtechlabs/log-engine for the Discord bot.
 * This replaces the custom logger wrapper with direct log-engine usage.
 * 
 * Configuration:
 * - Uses LogMode.DEBUG when DEBUG_MODE=true, otherwise LogMode.INFO
 * - Excludes ISO timestamps (includeIsoTimestamp: false)
 * - Includes local time formatting (includeLocalTime: true)
 * - No custom output handlers - uses log-engine defaults
 * 
 * @module config/logger
 */

import { LogEngine, LogMode } from '@wgtechlabs/log-engine';

// Configure LogEngine based on environment variables
const debugMode: boolean = process.env.DEBUG_MODE === 'true';

// Set the log mode based on DEBUG_MODE environment variable
// In debug mode, show all logs; otherwise show info and above
const logMode = debugMode ? LogMode.DEBUG : LogMode.INFO;

// Configure LogEngine with the required format settings
LogEngine.configure({
    mode: logMode,
    format: {
        includeIsoTimestamp: false,
        includeLocalTime: true,
    },
});

// Export LogEngine for use throughout the application
export { LogEngine };

// Re-export LogMode for convenience
export { LogMode };