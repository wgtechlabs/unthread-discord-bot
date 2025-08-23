/**
 * HTML Entity Decoder Utility
 * 
 * Provides functions for decoding common HTML entities to their text equivalents.
 * This is useful for processing text content that may contain HTML-encoded characters,
 * ensuring proper display in Discord messages and other text-based outputs.
 * 
 * @module utils/decodeHtmlEntities
 */

/**
 * Decodes common HTML entities to their text equivalents
 * 
 * Converts HTML-encoded characters back to their original form:
 * - &amp; → &
 * - &gt; → >
 * - &lt; → <
 * 
 * This is particularly useful when processing content from web sources
 * or APIs that may HTML-encode special characters for safety.
 * 
 * @param text - The text containing HTML entities to decode
 * @returns The decoded text with HTML entities replaced
 * 
 * @example
 * // Decode HTML entities in a message
 * const encodedText = "Hello &amp; welcome to our site! &lt;Click here&gt;";
 * const decodedText = decodeHtmlEntities(encodedText);
 * // Result: "Hello & welcome to our site! <Click here>"
 */
function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<');
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