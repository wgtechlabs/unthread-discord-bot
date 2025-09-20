/**
 * HTML Entity Decoder Test Suite
 *
 * Tests for HTML entity decoding utilities used throughout the application.
 *
 * @module tests/utils/decodeHtmlEntities
 */

import { describe, it, expect } from 'vitest';
import htmlEntityDecoder, { decodeHtmlEntities } from '../../utils/decodeHtmlEntities';

describe('decodeHtmlEntities', () => {
  describe('decodeHtmlEntities function', () => {
    it('should decode &amp; to &', () => {
      expect(decodeHtmlEntities('Hello &amp; World')).toBe('Hello & World');
    });

    it('should decode &gt; to >', () => {
      expect(decodeHtmlEntities('Value &gt; 10')).toBe('Value > 10');
    });

    it('should decode &lt; to <', () => {
      expect(decodeHtmlEntities('Value &lt; 10')).toBe('Value < 10');
    });

    it('should decode multiple entities in the same string', () => {
      const input = 'Hello &amp; welcome! Value &gt; 5 &amp; &lt; 10';
      const expected = 'Hello & welcome! Value > 5 & < 10';
      expect(decodeHtmlEntities(input)).toBe(expected);
    });

    it('should handle repeated entities', () => {
      expect(decodeHtmlEntities('&amp;&amp;&amp;')).toBe('&&&');
      expect(decodeHtmlEntities('&gt;&gt;&gt;')).toBe('>>>');
      expect(decodeHtmlEntities('&lt;&lt;&lt;')).toBe('<<<');
    });

    it('should handle text without entities', () => {
      const text = 'Hello World! This is a normal string.';
      expect(decodeHtmlEntities(text)).toBe(text);
    });

    it('should handle empty string', () => {
      expect(decodeHtmlEntities('')).toBe('');
    });

    it('should handle mixed content with HTML-like structures', () => {
      const input = 'Click &lt;button&gt; to continue &amp; proceed';
      const expected = 'Click <button> to continue & proceed';
      expect(decodeHtmlEntities(input)).toBe(expected);
    });

    it('should handle incomplete entities gracefully', () => {
      // These should not be decoded since they're incomplete
      expect(decodeHtmlEntities('&amp without semicolon')).toBe('&amp without semicolon');
      expect(decodeHtmlEntities('amp; without starting &')).toBe('amp; without starting &');
      expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
    });

    it('should preserve case sensitivity', () => {
      expect(decodeHtmlEntities('&AMP;')).toBe('&AMP;'); // Should not decode uppercase
      expect(decodeHtmlEntities('&GT;')).toBe('&GT;');   // Should not decode uppercase
      expect(decodeHtmlEntities('&LT;')).toBe('&LT;');   // Should not decode uppercase
    });

    it('should handle real-world examples', () => {
      // Example from API response
      const apiResponse = 'User submitted: &quot;Hello &amp; thanks!&quot; &lt;Click here&gt;';
      const decoded = decodeHtmlEntities(apiResponse);
      expect(decoded).toBe('User submitted: &quot;Hello & thanks!&quot; <Click here>');
      
      // Example from web content
      const webContent = 'Price: $5 &lt; $10 &amp; quality &gt; average';
      const decodedWeb = decodeHtmlEntities(webContent);
      expect(decodedWeb).toBe('Price: $5 < $10 & quality > average');
    });

    it('should handle whitespace correctly', () => {
      expect(decodeHtmlEntities(' &amp; ')).toBe(' & ');
      expect(decodeHtmlEntities('\t&gt;\n')).toBe('\t>\n');
      expect(decodeHtmlEntities('  &lt;  ')).toBe('  <  ');
    });

    it('should handle special characters around entities', () => {
      expect(decodeHtmlEntities('(&amp;)')).toBe('(&)');
      expect(decodeHtmlEntities('"&gt;"')).toBe('">"');  // Correctly expect both quotes
      expect(decodeHtmlEntities("'&lt;'")).toBe("'<'");
    });
  });

  describe('htmlEntityDecoder default export', () => {
    it('should export decodeHtmlEntities function', () => {
      expect(htmlEntityDecoder.decodeHtmlEntities).toBe(decodeHtmlEntities);
    });

    it('should work through default export', () => {
      const result = htmlEntityDecoder.decodeHtmlEntities('Test &amp; Example');
      expect(result).toBe('Test & Example');
    });
  });

  describe('edge cases and performance', () => {
    it('should handle very long strings', () => {
      const longString = 'Test &amp; '.repeat(1000);
      const expected = 'Test & '.repeat(1000);
      expect(decodeHtmlEntities(longString)).toBe(expected);
    });

    it('should handle strings with no entities efficiently', () => {
      const longStringNoEntities = 'This is a very long string without any HTML entities that should be processed quickly. '.repeat(100);
      expect(decodeHtmlEntities(longStringNoEntities)).toBe(longStringNoEntities);
    });

    it('should handle mixed entity patterns', () => {
      const mixed = '&amp;&gt;&lt;&amp;&gt;&lt;';
      const expected = '&><&><';
      expect(decodeHtmlEntities(mixed)).toBe(expected);
    });
  });

  describe('integration scenarios', () => {
    it('should handle Discord message formatting scenarios', () => {
      // Scenario: Message from webhook with HTML entities
      const webhookMessage = 'User said: &quot;The value is &gt; 5 &amp; &lt; 10&quot;';
      const processed = decodeHtmlEntities(webhookMessage);
      expect(processed).toBe('User said: &quot;The value is > 5 & < 10&quot;');
    });

    it('should handle code snippets with comparisons', () => {
      // Scenario: Code snippet with comparison operators
      const codeSnippet = 'if (value &gt; min &amp;&amp; value &lt; max)';
      const processed = decodeHtmlEntities(codeSnippet);
      expect(processed).toBe('if (value > min && value < max)');
    });

    it('should handle user input with escaped characters', () => {
      // Scenario: User input that was escaped for safety
      const userInput = 'My name is John &amp; I like coding &lt;HTML&gt;';
      const processed = decodeHtmlEntities(userInput);
      expect(processed).toBe('My name is John & I like coding <HTML>');
    });
  });
});