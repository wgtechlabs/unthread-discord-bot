/**
 * Retry Utility Module
 * 
 * This module provides a simple retry mechanism for operations that may fail temporarily.
 * It uses a linear backoff strategy with configurable attempts and delay.
 * 
 * @module utils/retry
 * @requires ./logger - For logging retry attempts and failures
 */
const logger = require('./logger');

/**
 * Executes an operation with retry logic
 * 
 * @param {Function} operation - Async function to execute with retry logic
 * @param {Object} options - Configuration options for retry behavior
 * @param {number} [options.maxAttempts=5] - Maximum number of retry attempts
 * @param {number} [options.baseDelayMs=3000] - Base delay between retries in milliseconds
 * @param {string} [options.operationName='operation'] - Name of operation for logging
 * @returns {Promise<any>} - Result of the operation if successful
 * @throws {Error} - If all retry attempts fail
 * 
 * @example
 * // Fetch data with retry
 * const result = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error('API request failed');
 *     return await response.json();
 *   },
 *   { operationName: 'API data fetch' }
 * );
 */
async function withRetry(operation, options = {}) {
    const {
        maxAttempts = 5,
        baseDelayMs = 3000,
        operationName = 'operation'
    } = options;

    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
        try {
            logger.info(`Attempt ${attempt+1}/${maxAttempts} for ${operationName}...`);
            
            // Execute the operation
            const result = await operation();
            
            // If we get here, the operation succeeded
            if (attempt > 0) {
                logger.info(`${operationName} succeeded on attempt ${attempt+1}`);
            }
            
            return result;
        } catch (error) {
            lastError = error;
            logger.debug(`Attempt ${attempt+1} failed: ${error.message}`);
            
            if (attempt < maxAttempts - 1) {
                // Calculate delay with linear backoff
                const delayMs = baseDelayMs * (attempt + 1);
                logger.info(`Retrying in ${delayMs/1000}s... (attempt ${attempt+1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        attempt++;
    }
    
    // If we get here, all attempts failed
    logger.error(`${operationName} failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
    throw new Error(`${operationName} failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
}

module.exports = { withRetry };