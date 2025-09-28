/**
 * HTML Entity Decoder - Text Processing Utility
 * 
 * @description 
 * Provides safe and efficient HTML entity decoding for text content processing.
 * Handles common HTML entities found in API responses, web content, and user input
 * to ensure proper display in Discord messages and logging systems.
 * 
 * @module utils/decodeHtmlEntities
 * @since 1.0.0
 * 
 * @keyFunctions
 * - decodeHtmlEntities(): Converts HTML entities to readable text characters
 * 
 * @commonIssues
 * - Incomplete decoding: Only handles basic entities (&amp;, &gt;, &lt;)
 * - Double encoding: Text encoded multiple times requires multiple passes
 * - Unicode entities: Named entities beyond basic set not supported
 * - Performance: Regex-based approach may be slow for very large texts
 * 
 * @troubleshooting
 * - For extended entity support, consider using a full HTML entity library
 * - Check for double-encoded text if output still contains entities
 * - Validate input is actually HTML-encoded before processing
 * - Monitor performance with large text blocks (>10KB)
 * 
 * @performance
 * - Optimized for common entities in API responses
 * - Sequential regex replacement for safety and predictability
 * - No external dependencies for minimal overhead
 * - Safe for concurrent use across multiple threads
 * 
 * @dependencies None (pure JavaScript implementation)
 * 
 * @example Basic Usage
 * ```typescript
 * const decoded = decodeHtmlEntities("User said: &quot;Hello &amp; welcome!&quot;");
 * // Result: 'User said: "Hello & welcome!"'
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * // Processing API response content
 * const apiResponse = { message: "Error: Value must be &gt; 0 &amp; &lt; 100" };
 * const cleanMessage = decodeHtmlEntities(apiResponse.message);
 * LogEngine.info(cleanMessage); // "Error: Value must be > 0 & < 100"
 * ```
 */

/**
 * Decodes common HTML entities to readable text characters
 *
 * @function decodeHtmlEntities
 * @param {string} text - Text containing HTML entities to decode
 * @returns {string} Decoded text with entities replaced by actual characters
 *
 * @example
 * ```typescript
 * const decoded = decodeHtmlEntities("Hello &amp; welcome! &lt;Click here&gt;");
 * console.log(decoded); // "Hello & welcome! <Click here>"
 * ```
 * 
 * @troubleshooting
 * - Only handles basic entities: &amp;, &gt;, &lt;, &quot;
 * - For full HTML entity support, consider he or html-entities packages
 * - Check for double-encoding if entities remain after processing
 */
function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&quot;/g, '"');
}

/**
 * HTML entity decoder utilities
 */
const htmlEntityDecoder = {
	decodeHtmlEntities,
};

export default htmlEntityDecoder;

// Export individual functions for named imports
export { decodeHtmlEntities };