/**
 * Logger Module
 * 
 * A simple logging utility that provides different logging levels with prefix labels.
 * Controls output verbosity based on environment configuration.
 * 
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.debug('Detailed information for debugging');
 *   logger.info('Important application events');
 *   logger.warn('Warning conditions');
 *   logger.error('Error conditions');
 * 
 * Configuration:
 *   Set DEBUG_MODE=true in your .env file to enable debug logs.
 *   Debug logs are hidden by default in production environments.
 */

// Determine if debug mode is enabled from environment variables
// This controls whether debug-level logs are displayed
const debugMode = process.env.DEBUG_MODE === 'true';

/**
 * Gets a formatted timestamp string for the current time
 * Format: MM-DD-YYYY HH:MM:SS.mmm
 * 
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Log debug information (only visible when DEBUG_MODE=true)
 * Used for detailed troubleshooting information that is too verbose for regular operation
 * 
 * @param {...any} args - Arguments to log (strings, objects, etc.)
 */
function debug(...args) {
    if (debugMode) {
        if (args.length > 0) {
            if (typeof args[0] === 'string') {
                args[0] = `[DEBUG] ${args[0]}`;
            } else {
                args.unshift(`[DEBUG]`);
            }
        }
        console.log(...args);
    }
}

/**
 * Log informational messages (always visible)
 * Used for general operational information about system activities
 * 
 * @param {...any} args - Arguments to log (strings, objects, etc.)
 */
function info(...args) {
    // Always show info-level logs regardless of debug mode
    if (args.length > 0) {
        if (typeof args[0] === 'string') {
            args[0] = `[INFO] ${args[0]}`;
        } else {
            args.unshift(`[INFO]`);
        }
    }
    console.log(...args);
}

/**
 * Log warning messages (always visible)
 * Used for warning conditions that don't prevent the application from working
 * but indicate potential problems or unexpected behavior
 * 
 * @param {...any} args - Arguments to log (strings, objects, etc.)
 */
function warn(...args) {
    if (args.length > 0) {
        if (typeof args[0] === 'string') {
            args[0] = `[WARN] ${args[0]}`;
        } else {
            args.unshift(`[WARN]`);
        }
    }
    console.warn(...args);  // Uses console.warn for proper error stream routing
}

/**
 * Log error messages (always visible)
 * Used for error conditions that prevent normal operation but don't crash the application
 * 
 * @param {...any} args - Arguments to log (strings, objects, etc.)
 */
function error(...args) {
    if (args.length > 0) {
        if (typeof args[0] === 'string') {
            args[0] = `[ERROR] ${args[0]}`;
        } else {
            args.unshift(`[ERROR]`);
        }
    }
    console.error(...args);  // Uses console.error for proper error stream routing
}

// Export the logging functions for use in other modules
module.exports = { debug, info, error, warn };
