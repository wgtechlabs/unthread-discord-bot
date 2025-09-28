import { Events } from 'discord.js';
import { LogEngine } from '../config/logger';

/**
 * Discord Error Handler - Global Error Management
 * 
 * @description 
 * Captures and logs unhandled errors from the Discord.js client including
 * WebSocket connection failures, API errors, rate limit violations, and other
 * lower-level issues that occur outside normal command execution flow.
 * 
 * @module events/error
 * @since 1.0.0
 * 
 * @keyFunctions
 * - execute(): Logs Discord.js client errors with full stack traces
 * 
 * @commonIssues
 * - WebSocket errors: Connection issues with Discord Gateway (reconnect required)
 * - Rate limit errors: Too many API requests causing HTTP 429 responses
 * - Permission errors: Bot lacks necessary permissions in channels or servers
 * - Token authentication: Invalid or expired bot token requires regeneration
 * - Network errors: Internet connectivity or DNS resolution problems
 * 
 * @troubleshooting
 * - Check Discord API status at https://discordstatus.com/ for service issues
 * - Verify bot token is valid in Discord Developer Portal
 * - Review bot permissions in problematic servers and channels
 * - Monitor error frequency patterns for systemic issues vs isolated incidents
 * - Check network connectivity and DNS resolution for api.discord.com
 * - Implement rate limiting in command handlers to prevent API abuse
 * 
 * @performance
 * - Errors logged asynchronously to prevent blocking main thread
 * - Full stack traces captured for comprehensive debugging information
 * - Error patterns monitored to identify performance bottlenecks
 * 
 * @dependencies Discord.js Events, LogEngine
 * 
 * @example Basic Usage
 * ```typescript
 * // This handler is automatically registered by Discord.js
 * // Errors are captured and logged without manual intervention
 * client.on(Events.Error, execute);
 * ```
 * 
 * @example Advanced Usage  
 * ```typescript
 * // Monitor specific error patterns in your application
 * export function execute(error: Error): void {
 *   LogEngine.error(`Discord.js Client Error: ${error.stack || error}`);
 *   
 *   // Add custom error handling for specific error types
 *   if (error.message.includes('TOKEN_INVALID')) {
 *     // Handle token issues
 *   }
 * }
 * ```
 */
export const name = Events.Error;
export const once = false;

/**
 * Handles unhandled Discord.js client errors and logs them for monitoring
 * 
 * @function execute
 * @param {Error} error - Error object containing details about the failure
 * @returns {void} Errors are logged but not propagated to prevent bot crashes
 * 
 * @example
 * ```typescript
 * // Automatically called by Discord.js - no manual invocation needed
 * // Handles errors like:
 * // - WebSocket connection failures
 * // - API rate limit violations (HTTP 429)
 * // - Permission denied errors
 * // - Token authentication failures
 * ```
 * 
 * @troubleshooting
 * - Check error.message for specific error types and codes
 * - Monitor error frequency - spikes indicate systemic issues
 * - Cross-reference with Discord API status for service outages
 * - Review bot permissions if permission-related errors occur
 */
export function execute(error: Error): void {
	// Log the error with full stack trace for troubleshooting
	LogEngine.error(`Discord.js Client Error: ${error.stack || error}`);
}