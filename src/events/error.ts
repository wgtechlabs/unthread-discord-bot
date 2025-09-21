import { Events } from 'discord.js';
import { LogEngine } from '../config/logger';

/**
 * Global Discord.js Error Event Handler
 *
 * This module captures and logs unhandled errors from the Discord.js client.
 * These are typically lower-level errors like network issues, API problems,
 * or WebSocket connection failures that occur outside normal command execution.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This error handler is your first line of defense for debugging bot issues.
 * Most runtime problems will surface here, making it crucial for monitoring
 * bot health and identifying systemic issues.
 *
 * 🔍 COMMON ERROR TYPES:
 * =====================
 * - WebSocket errors: Connection issues with Discord Gateway
 * - Rate limit errors: Too many API requests, need backoff
 * - Permission errors: Bot lacks necessary permissions
 * - Network errors: Internet connectivity or DNS issues
 * - API errors: Discord service problems or invalid requests
 *
 * 🐛 DEBUGGING STEPS:
 * ==================
 * 1. Check network connectivity issues
 * 2. Verify Discord API status: https://discordstatus.com/
 * 3. Examine Discord developer portal for rate limits or token issues
 * 4. Review bot permissions in problematic servers
 * 5. Monitor error frequency for patterns
 *
 * 🚨 CRITICAL ERRORS TO WATCH:
 * ===========================
 * - Token authentication failures (requires immediate attention)
 * - Persistent connection errors (may indicate network issues)
 * - Rate limit violations (need to implement better throttling)
 * - Permission errors in key channels (affects functionality)
 *
 * 💡 MONITORING TIPS:
 * ==================
 * - Set up alerts for high error rates
 * - Track error patterns over time
 * - Correlate errors with deployment or configuration changes
 * - Use error data to improve error handling in other modules
 */
export const name = Events.Error;
export const once = false;

/**
 * Executes when an unhandled error occurs in the Discord.js client
 *
 * This function captures and logs all unhandled errors from the Discord.js client,
 * including WebSocket connection failures, API errors, rate limit violations,
 * and other lower-level issues that occur outside normal command execution.
 *
 * @param error - The error object containing details about what went wrong
 * @returns void - Errors are logged but not propagated to prevent crashes
 *
 * @example
 * ```typescript
 * // This function is automatically called by Discord.js for unhandled errors
 * // Common error types include:
 * // - WebSocket connection issues
 * // - API rate limit violations
 * // - Permission denied errors
 * // - Network connectivity problems
 * ```
 *
 * @critical This is the primary error monitoring point for bot health
 * @see {@link LogEngine} for error logging implementation
 * @see {@link https://discordstatus.com/} for Discord API status
 */
export function execute(error: Error): void {
	// Log the error with full stack trace for troubleshooting
	LogEngine.error(`Discord.js Client Error: ${error.stack || error}`);
}