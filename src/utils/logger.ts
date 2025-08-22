/**
 * Logger Module
 * 
 * A clean logging utility that integrates with @wgtechlabs/log-engine.
 * Provides different logging levels with clean output - no emojis, only error type and local time.
 * 
 * Usage:
 *   import logger from './utils/logger';
 *   logger.debug('Detailed information for debugging');
 *   logger.info('Important application events');
 *   logger.warn('Warning conditions');
 *   logger.error('Error conditions');
 * 
 * Configuration:
 *   Set DEBUG_MODE=true in your .env file to enable debug logs.
 *   Debug logs are hidden by default in production environments.
 * 
 * @module utils/logger
 */

import { Logger } from '../types/discord';

// Import LogEngine and LogMode from @wgtechlabs/log-engine
// Note: Using require() as this package may not have full TypeScript definitions
const { LogEngine, LogMode } = require('@wgtechlabs/log-engine') as any;

// Configure LogEngine based on environment variables
// This controls the logging level and output behavior
const debugMode: boolean = process.env.DEBUG_MODE === 'true';

// Set the log mode based on DEBUG_MODE environment variable
// In debug mode, show all logs; otherwise show info and above
const logMode = debugMode ? LogMode.DEBUG : LogMode.INFO;

/**
 * Gets a formatted local timestamp string for the current time
 * Format: HH:MM:SS
 * 
 * @returns Formatted local time
 */
function getLocalTime(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Custom output handler that shows only error type and local time
 * Removes ISO timestamp and follows clean, minimal format
 * 
 * @param level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param message - Log message (may contain ANSI codes and timestamps)
 * @param data - Additional data (optional)
 */
function customOutputHandler(level: string, message: string, data?: any): void {
    const localTime = getLocalTime();
    const levelUpper = level.toUpperCase();
    
    // Remove ANSI color codes and extract the actual message content
    let cleanMessage = message.replace(/\u001b\[[0-9;]*m/g, '');
    
    // Extract just the message text after the formatted prefixes
    // Pattern: [timestamp][time][LEVEL]: actual message
    const messageMatch = cleanMessage.match(/^.*?\[.*?\].*?\[.*?\].*?\[.*?\]:\s*(.*)$/);
    if (messageMatch && messageMatch[1]) {
        cleanMessage = messageMatch[1].trim();
        
        // Remove any JSON data that might be appended to the message
        cleanMessage = cleanMessage.replace(/\s*\{.*\}$/, '');
    }
    
    if (data !== undefined && data !== null) {
        console.log(`[${localTime}][${levelUpper}]: ${cleanMessage}`, data);
    } else {
        console.log(`[${localTime}][${levelUpper}]: ${cleanMessage}`);
    }
}

// Configure LogEngine with custom output handler to meet requirements
LogEngine.configure({ 
    mode: logMode,
    outputHandler: customOutputHandler,
    suppressConsoleOutput: true  // Disable default console output to use our custom handler
});

/**
 * Log debug information (only visible when DEBUG_MODE=true)
 * Used for detailed troubleshooting information that is too verbose for regular operation
 * 
 * @param args - Arguments to log (strings, objects, etc.)
 */
function debug(...args: any[]): void {
    LogEngine.debug(...args);
}

/**
 * Log informational messages (always visible)
 * Used for general operational information about system activities
 * 
 * @param args - Arguments to log (strings, objects, etc.)
 */
function info(...args: any[]): void {
    LogEngine.info(...args);
}

/**
 * Log warning messages (always visible)
 * Used for warning conditions that don't prevent the application from working
 * but indicate potential problems or unexpected behavior
 * 
 * @param args - Arguments to log (strings, objects, etc.)
 */
function warn(...args: any[]): void {
    LogEngine.warn(...args);
}

/**
 * Log error messages (always visible)
 * Used for error conditions that prevent normal operation but don't crash the application
 * 
 * @param args - Arguments to log (strings, objects, etc.)
 */
function error(...args: any[]): void {
    LogEngine.error(...args);
}

/**
 * Logger instance implementing the Logger interface
 */
const logger: Logger = {
	debug,
	info,
	warn,
	error,
};

// Export the logging functions for use in other modules
export default logger;