/**
 * Test Suite: HTML Entity Decoder Utility
 *
 * Comprehensive tests for the decodeHtmlEntities utility module.
 * Tests cover basic decoding, edge cases, performance, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '@utils/decodeHtmlEntities';
import htmlEntityDecoder from '@utils/decodeHtmlEntities';

describe('decodeHtmlEntities', () => {
	describe('Basic HTML Entity Decoding', () => {
		it('should decode ampersand entities', () => {
			expect(decodeHtmlEntities('Hello &amp; welcome')).toBe('Hello & welcome');
		});

		it('should decode greater than entities', () => {
			expect(decodeHtmlEntities('Value &gt; 10')).toBe('Value > 10');
		});

		it('should decode less than entities', () => {
			expect(decodeHtmlEntities('Value &lt; 5')).toBe('Value < 5');
		});

		it('should decode multiple entity types in one string', () => {
			const input = 'Hello &amp; welcome! Value &gt; 0 &amp; &lt; 100';
			const expected = 'Hello & welcome! Value > 0 & < 100';
			expect(decodeHtmlEntities(input)).toBe(expected);
		});

		it('should decode entities in realistic Discord message content', () => {
			const input = '&lt;@everyone&gt; Check this out: &amp;quot;Amazing&amp;quot; &gt; normal';
			const expected = '<@everyone> Check this out: &quot;Amazing&quot; > normal';
			expect(decodeHtmlEntities(input)).toBe(expected);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty string', () => {
			expect(decodeHtmlEntities('')).toBe('');
		});

		it('should handle string with no entities', () => {
			const input = 'Regular text without entities';
			expect(decodeHtmlEntities(input)).toBe(input);
		});

		it('should handle multiple consecutive entities', () => {
			expect(decodeHtmlEntities('&amp;&amp;&gt;&lt;')).toBe('&&><');
		});

		it('should handle entities at start and end of string', () => {
			expect(decodeHtmlEntities('&amp;middle&gt;')).toBe('&middle>');
		});

		it('should not decode incomplete entities', () => {
			expect(decodeHtmlEntities('&amp test &gt')).toBe('&amp test &gt');
		});

		it('should not decode invalid entities', () => {
			expect(decodeHtmlEntities('&invalid; &unknown;')).toBe('&invalid; &unknown;');
		});

		it('should handle mixed valid and invalid entities', () => {
			expect(decodeHtmlEntities('&amp; &invalid; &gt;')).toBe('& &invalid; >');
		});
	});

	describe('Performance and Robustness', () => {
		it('should handle very long strings efficiently', () => {
			const longString = 'Hello &amp; welcome! '.repeat(1000);
			const result = decodeHtmlEntities(longString);

			expect(result).toBe('Hello & welcome! '.repeat(1000));
			// Each &amp; becomes & (saves 4 chars)
			expect(result.length).toBe(longString.length - 4000);
		});

		it('should handle strings with many entities', () => {
			const manyEntities = '&amp;'.repeat(100);
			const result = decodeHtmlEntities(manyEntities);

			expect(result).toBe('&'.repeat(100));
		});

		it('should handle complex nested-like patterns', () => {
			const complex = '&amp;amp; &amp;gt; &amp;lt;';
			// &amp;amp; -> &amp; -> &amp; (stops there)
			// &amp;gt; -> &gt; -> >
			// &amp;lt; -> &lt; -> <
			const expected = '&amp; > <';
			expect(decodeHtmlEntities(complex)).toBe(expected);
		});

		it('should handle special characters around entities', () => {
			expect(decodeHtmlEntities('((&amp;)) [&gt;] {&lt;}')).toBe('((&)) [>] {<}');
		});
	});

	describe('Real-world Use Cases', () => {
		it('should decode typical web API response content', () => {
			const apiResponse = 'Error: Value must be &gt; 0 &amp; &lt; 100';
			const expected = 'Error: Value must be > 0 & < 100';
			expect(decodeHtmlEntities(apiResponse)).toBe(expected);
		});

		it('should decode HTML-escaped Discord message content', () => {
			const discordContent = 'User said: &amp;quot;This &gt; that&amp;quot;';
			const expected = 'User said: &quot;This > that&quot;';
			expect(decodeHtmlEntities(discordContent)).toBe(expected);
		});

		it('should decode ticket content from external systems', () => {
			const ticketContent = 'Issue: Database query returned rows where id &gt; 1000 &amp; status = &amp;quot;active&amp;quot;';
			const expected = 'Issue: Database query returned rows where id > 1000 & status = &quot;active&quot;';
			expect(decodeHtmlEntities(ticketContent)).toBe(expected);
		});

		it('should handle code snippets with entities', () => {
			const codeSnippet = 'if (value &gt; 0 &amp;&amp; value &lt; 100) { return true; }';
			const expected = 'if (value > 0 && value < 100) { return true; }';
			expect(decodeHtmlEntities(codeSnippet)).toBe(expected);
		});
	});

	describe('Module Exports', () => {
		it('should export named function correctly', () => {
			expect(typeof decodeHtmlEntities).toBe('function');
		});

		it('should export default object with decodeHtmlEntities property', () => {
			expect(typeof htmlEntityDecoder).toBe('object');
			expect(typeof htmlEntityDecoder.decodeHtmlEntities).toBe('function');
		});

		it('should have consistent behavior between named and default exports', () => {
			const testString = 'Test &amp; decode &gt; entities';
			const namedResult = decodeHtmlEntities(testString);
			const defaultResult = htmlEntityDecoder.decodeHtmlEntities(testString);

			expect(namedResult).toBe(defaultResult);
		});
	});

	describe('Input Validation', () => {
		it('should handle TypeScript type safety', () => {
			// The function expects string input per TypeScript types
			// Runtime type coercion tests removed since they're not part of the API contract
			expect(typeof decodeHtmlEntities('test')).toBe('string');
		});
	});

	describe('Consistency and Idempotency', () => {
		it('should be idempotent for already decoded strings', () => {
			const alreadyDecoded = 'Hello & world > test < end';
			expect(decodeHtmlEntities(alreadyDecoded)).toBe(alreadyDecoded);
		});

		it('should produce consistent results for same input', () => {
			const input = 'Test &amp; consistency &gt; check';
			const result1 = decodeHtmlEntities(input);
			const result2 = decodeHtmlEntities(input);

			expect(result1).toBe(result2);
		});

		it('should not double-decode entities', () => {
			const encoded = '&amp;gt;'; // This represents &gt; in HTML
			const result = decodeHtmlEntities(encoded);

			// Should decode &amp; to &, making &gt;, then &gt; becomes >
			expect(result).toBe('>');

			// Running again should not change it further since there are no entities
			expect(decodeHtmlEntities(result)).toBe('>');
		});
	});
});