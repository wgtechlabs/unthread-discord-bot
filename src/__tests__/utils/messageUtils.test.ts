/**
 * Message Utils Test Suite
 *
 * Tests for message processing utilities including duplicate detection,
 * attachment handling, and quoted content processing.
 *
 * @module tests/utils/messageUtils
 */

import { describe, it, expect, beforeEach } from 'vitest';
import messageUtils, { 
  isDuplicateMessage, 
  removeAttachmentSection, 
  processQuotedContent 
} from '../../utils/messageUtils';

describe('messageUtils', () => {
  describe('isDuplicateMessage', () => {
    const existingMessages = [
      { content: 'Hello world', id: 'msg1' },
      { content: 'This is a test message', id: 'msg2' },
      { content: 'Another message with more content here', id: 'msg3' },
    ];

    it('should return false for empty or null content', () => {
      expect(isDuplicateMessage(existingMessages, '')).toBe(false);
      expect(isDuplicateMessage(existingMessages, '   ')).toBe(false);
    });

    it('should return false for empty message array', () => {
      expect(isDuplicateMessage([], 'Test message')).toBe(false);
    });

    it('should detect exact duplicate messages', () => {
      expect(isDuplicateMessage(existingMessages, 'Hello world')).toBe(true);
      expect(isDuplicateMessage(existingMessages, 'This is a test message')).toBe(true);
    });

    it('should not detect false positives for short messages', () => {
      expect(isDuplicateMessage(existingMessages, 'Hi')).toBe(false);
      expect(isDuplicateMessage(existingMessages, 'Test')).toBe(false);
    });

    it('should detect fuzzy duplicates for longer messages', () => {
      const messages = [
        { content: 'This is a longer message with sufficient content', id: 'msg1' },
      ];
      
      // Should detect when new message contains existing message
      expect(isDuplicateMessage(messages, 'This is a longer message with sufficient content and more')).toBe(true);
      
      // Should detect when existing message contains new message
      expect(isDuplicateMessage(messages, 'This is a longer message')).toBe(true);
    });

    it('should not detect fuzzy duplicates when length difference is too large', () => {
      const messages = [
        { content: 'Short message', id: 'msg1' },
      ];
      
      expect(isDuplicateMessage(messages, 'Short message with a lot more content that makes it much longer than the original')).toBe(false);
    });

    it('should normalize whitespace when checking for duplicates', () => {
      const messages = [
        { content: 'Message   with   extra   spaces', id: 'msg1' },
      ];
      
      expect(isDuplicateMessage(messages, 'Message with extra spaces')).toBe(true);
    });
  });

  describe('removeAttachmentSection', () => {
    it('should return empty string for null or undefined input', () => {
      expect(removeAttachmentSection('')).toBe('');
      expect(removeAttachmentSection(null as any)).toBe('');
      expect(removeAttachmentSection(undefined as any)).toBe('');
    });

    it('should remove attachment sections with URL format', () => {
      const messageWithAttachment = 'Hello world\n\nAttachments: <https://cdn.discordapp.com/attachments/123/456/image.png>';
      expect(removeAttachmentSection(messageWithAttachment)).toBe('Hello world');
    });

    it('should remove attachment sections with markdown link format', () => {
      const messageWithAttachment = 'Hello world\n\nAttachments: [image.png](https://cdn.discordapp.com/attachments/123/456/image.png)';
      expect(removeAttachmentSection(messageWithAttachment)).toBe('Hello world');
    });

    it('should remove general attachment sections', () => {
      const messageWithAttachment = 'Hello world\n\nAttachments: file_1 | file_2';
      expect(removeAttachmentSection(messageWithAttachment)).toBe('Hello world');
    });

    it('should handle multiple attachment patterns', () => {
      const messageWithAttachment = 'Hello world\n\nAttachments: [file1.png](url1) | [file2.jpg](url2)';
      expect(removeAttachmentSection(messageWithAttachment)).toBe('Hello world');
    });

    it('should not affect messages without attachments', () => {
      const message = 'Hello world\n\nThis is a normal message';
      expect(removeAttachmentSection(message)).toBe(message);
    });
  });

  describe('processQuotedContent', () => {
    const existingMessages = [
      { content: 'Original message content', id: 'msg1' },
      { content: 'Another original message', id: 'msg2' },
    ];

    it('should return original content when no quotes are present', () => {
      const result = processQuotedContent('Just a normal message', existingMessages);
      expect(result.replyReference).toBeNull();
      expect(result.contentToSend).toBe('Just a normal message');
      expect(result.isDuplicate).toBeUndefined();
    });

    it('should handle empty inputs gracefully', () => {
      expect(processQuotedContent('', [])).toEqual({
        replyReference: null,
        contentToSend: '',
      });
      
      expect(processQuotedContent('test', [])).toEqual({
        replyReference: null,
        contentToSend: 'test',
      });
    });

    it('should detect and process quoted content', () => {
      const quotedMessage = '> Original message content\nMy reply to the message';
      const result = processQuotedContent(quotedMessage, existingMessages);
      
      expect(result.replyReference).toBe('msg1');
      expect(result.contentToSend).toBe('My reply to the message');
    });

    it('should handle multi-line quoted content', () => {
      const quotedMessage = '> Line one of quote\n> Line two of quote\nMy reply';
      const messages = [{ content: 'Line one of quote\nLine two of quote', id: 'original' }];
      const result = processQuotedContent(quotedMessage, messages);
      
      expect(result.replyReference).toBe('original');
      expect(result.contentToSend).toBe('My reply');
    });

    it('should ignore attachment references that look like quotes', () => {
      const attachmentRef = '> Attachments: [file.png](url)';
      const result = processQuotedContent(attachmentRef, existingMessages);
      
      expect(result.replyReference).toBeNull();
      expect(result.contentToSend).toBe(attachmentRef);
    });

    it('should detect duplicate replies', () => {
      const quotedMessage = '> Original message content\nAnother original message';
      const result = processQuotedContent(quotedMessage, existingMessages);
      
      expect(result.isDuplicate).toBe(true);
    });

    it('should handle empty reply content with fallback', () => {
      const quotedMessage = '> Original message content\n';
      const result = processQuotedContent(quotedMessage, existingMessages);
      
      expect(result.replyReference).toBe('msg1');
      expect(result.contentToSend).toBe(' '); // Fallback for empty content
    });

    it('should normalize content when matching quoted messages', () => {
      const messages = [
        { content: 'Message with attachments\n\nAttachments: [file.png](url)', id: 'msg1' },
      ];
      
      const quotedMessage = '> Message with attachments\nMy reply';
      const result = processQuotedContent(quotedMessage, messages);
      
      expect(result.replyReference).toBe('msg1');
      expect(result.contentToSend).toBe('My reply');
    });
  });

  describe('messageUtils default export', () => {
    it('should export all utility functions', () => {
      expect(messageUtils.isDuplicateMessage).toBe(isDuplicateMessage);
      expect(messageUtils.removeAttachmentSection).toBe(removeAttachmentSection);
      expect(messageUtils.processQuotedContent).toBe(processQuotedContent);
    });
  });
});