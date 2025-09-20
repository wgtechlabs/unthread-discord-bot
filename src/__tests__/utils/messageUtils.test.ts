/**
 * Test Suite: Message Utilities
 *
 * Comprehensive tests for the messageUtils module.
 * Tests cover duplicate detection, attachment processing, quoted content handling,
 * and various edge cases for Discord ↔ Unthread message synchronization.
 */

import { describe, it, expect } from 'vitest';
import { 
  isDuplicateMessage, 
  removeAttachmentSection, 
  processQuotedContent 
} from '@utils/messageUtils';
import messageUtils from '@utils/messageUtils';
import { LogEngine } from '@wgtechlabs/log-engine';

// Mock message interface for testing
interface TestMessage {
  content: string;
  id?: string;
}

describe('messageUtils', () => {
  describe('isDuplicateMessage', () => {
    describe('Basic Duplicate Detection', () => {
      it('should return false for empty message arrays', () => {
        expect(isDuplicateMessage([], 'test message')).toBe(false);
      });

      it('should return false for empty content', () => {
        const messages = [{ content: 'existing message' }];
        expect(isDuplicateMessage(messages, '')).toBe(false);
      });

      it('should detect exact duplicate messages', () => {
        const messages = [
          { content: 'Hello world' },
          { content: 'Another message' }
        ];
        
        expect(isDuplicateMessage(messages, 'Hello world')).toBe(true);
      });

      it('should return false for non-duplicate messages', () => {
        const messages = [
          { content: 'Hello world' },
          { content: 'Another message' }
        ];
        
        expect(isDuplicateMessage(messages, 'Unique message')).toBe(false);
      });

      it('should handle case-sensitive comparison', () => {
        const messages = [{ content: 'Hello World' }];
        
        expect(isDuplicateMessage(messages, 'hello world')).toBe(false);
      });
    });

    describe('Whitespace and Trimming', () => {
      it('should trim content before comparison', () => {
        const messages = [{ content: 'Hello world' }];
        
        expect(isDuplicateMessage(messages, '  Hello world  ')).toBe(true);
      });

      it('should normalize whitespace in fuzzy matching', () => {
        const messages = [{ content: 'Hello    world    test' }];
        
        expect(isDuplicateMessage(messages, 'Hello world test')).toBe(true);
      });

      it('should handle messages with only whitespace', () => {
        const messages = [{ content: '   ' }];
        
        expect(isDuplicateMessage(messages, '   ')).toBe(false); // Too short
      });
    });

    describe('Short Message Handling', () => {
      it('should skip duplicate check for very short messages', () => {
        const messages = [{ content: 'Hi' }];
        
        expect(isDuplicateMessage(messages, 'Hi')).toBe(false);
      });

      it('should process messages that are exactly 5 characters', () => {
        const messages = [{ content: 'Hello' }];
        
        expect(isDuplicateMessage(messages, 'Hello')).toBe(true);
      });

      it('should process messages longer than 5 characters', () => {
        const messages = [{ content: 'Hello world' }];
        
        expect(isDuplicateMessage(messages, 'Hello world')).toBe(true);
      });
    });

    describe('Fuzzy Duplicate Detection', () => {
      it('should detect when new message is contained in existing message', () => {
        const messages = [{ content: 'This is a long message with extra formatting' }];
        
        expect(isDuplicateMessage(messages, 'This is a long message')).toBe(true);
      });

      it('should detect when existing message is contained in new message', () => {
        const messages = [{ content: 'Short message' }];
        
        expect(isDuplicateMessage(messages, 'This is a short message with extra content')).toBe(true);
      });

      it('should only match if length ratio is reasonable', () => {
        const messages = [{ content: 'Very long message that should not match because the ratio is too different from the short new message content and this would cause false positives in detection' }];
        
        expect(isDuplicateMessage(messages, 'short')).toBe(false);
      });

      it('should apply fuzzy matching only to messages >= 10 chars', () => {
        const messages = [{ content: 'Short msg' }];
        
        expect(isDuplicateMessage(messages, 'Short')).toBe(false);
      });

      it('should log debug information for exact duplicates', () => {
        const messages = [{ content: 'Test message' }];
        
        isDuplicateMessage(messages, 'Test message');
        
        expect(LogEngine.debug).toHaveBeenCalledWith('Exact duplicate message detected');
      });

      it('should log debug information for fuzzy duplicates', () => {
        const messages = [{ content: 'This is a test message with formatting' }];
        
        isDuplicateMessage(messages, 'This is a test message');
        
        expect(LogEngine.debug).toHaveBeenCalledWith('Content duplicate message detected (fuzzy match)');
      });
    });

    describe('Edge Cases', () => {
      it('should handle null/undefined messages array', () => {
        expect(isDuplicateMessage(null as any, 'test')).toBe(false);
        expect(isDuplicateMessage(undefined as any, 'test')).toBe(false);
      });

      it('should handle null/undefined content', () => {
        const messages = [{ content: 'test' }];
        expect(isDuplicateMessage(messages, null as any)).toBe(false);
        expect(isDuplicateMessage(messages, undefined as any)).toBe(false);
      });

      it('should handle empty content array', () => {
        expect(isDuplicateMessage([], 'test message')).toBe(false);
      });

      it('should handle messages with special characters', () => {
        const messages = [{ content: 'Special chars: !@#$%^&*()_+{}|:"<>?[]\\;\',./' }];
        
        expect(isDuplicateMessage(messages, 'Special chars: !@#$%^&*()_+{}|:"<>?[]\\;\',./')).toBe(true);
      });

      it('should handle Unicode characters', () => {
        const messages = [{ content: 'Unicode: 🎉 🚀 ✨ 💯' }];
        
        expect(isDuplicateMessage(messages, 'Unicode: 🎉 🚀 ✨ 💯')).toBe(true);
      });

      it('should handle very long messages', () => {
        const longMessage = 'This is a very long message that repeats. '.repeat(100);
        const messages = [{ content: longMessage }];
        
        expect(isDuplicateMessage(messages, longMessage)).toBe(true);
      });
    });
  });

  describe('removeAttachmentSection', () => {
    describe('Basic Attachment Removal', () => {
      it('should remove attachment section with angle bracket format', () => {
        const input = 'Hello world\n\nAttachments: <https://cdn.discord.com/image.png|image.png>';
        const expected = 'Hello world';
        
        expect(removeAttachmentSection(input)).toBe(expected);
      });

      it('should remove attachment section with markdown link format', () => {
        const input = 'Hello world\n\nAttachments: [image.png](https://cdn.discord.com/image.png)';
        const expected = 'Hello world';
        
        expect(removeAttachmentSection(input)).toBe(expected);
      });

      it('should remove attachment section with general content', () => {
        const input = 'Hello world\n\nAttachments: file1.pdf, file2.doc';
        const expected = 'Hello world';
        
        expect(removeAttachmentSection(input)).toBe(expected);
      });

      it('should handle multiple attachment formats in one message', () => {
        const input = 'Hello world\n\nAttachments: <file1.png|file1> and [file2.pdf](https://example.com/file2.pdf)';
        const expected = 'Hello world';
        
        expect(removeAttachmentSection(input)).toBe(expected);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        expect(removeAttachmentSection('')).toBe('');
      });

      it('should handle null/undefined input', () => {
        expect(removeAttachmentSection(null as any)).toBe('');
        expect(removeAttachmentSection(undefined as any)).toBe('');
      });

      it('should return original string if no attachments section', () => {
        const input = 'Regular message without attachments';
        expect(removeAttachmentSection(input)).toBe(input);
      });

      it('should handle attachments at the beginning (edge case)', () => {
        const input = 'Attachments: <file.png|file>\n\nRegular content';
        // This might not match current patterns, but should handle gracefully
        expect(removeAttachmentSection(input)).toContain('Regular content');
      });

      it('should handle multiple attachment sections', () => {
        const input = 'Content\n\nAttachments: <file1.png|file1>\n\nMore content\n\nAttachments: [file2.pdf](url)';
        const result = removeAttachmentSection(input);
        
        expect(result).not.toContain('Attachments:');
        expect(result).toContain('Content');
        expect(result).toContain('More content');
      });

      it('should preserve content before attachment sections', () => {
        const input = 'Important message content here\n\nAttachments: <file.png|file>';
        const result = removeAttachmentSection(input);
        
        expect(result).toBe('Important message content here');
      });
    });

    describe('Real-world Scenarios', () => {
      it('should handle Discord attachment format', () => {
        const input = 'Check out this screenshot\n\nAttachments: <https://cdn.discordapp.com/attachments/123/456/screenshot.png|screenshot.png>';
        const expected = 'Check out this screenshot';
        
        expect(removeAttachmentSection(input)).toBe(expected);
      });

      it('should handle multiple Discord attachments', () => {
        const input = 'Files for review\n\nAttachments: <file1.pdf|document> <file2.png|image>';
        const result = removeAttachmentSection(input);
        
        expect(result).toBe('Files for review');
      });

      it('should handle mixed content and attachments', () => {
        const input = 'Here is the requested information.\n\nPlease see attached files.\n\nAttachments: [report.pdf](https://example.com/report.pdf)';
        const result = removeAttachmentSection(input);
        
        expect(result).toBe('Here is the requested information.\n\nPlease see attached files.');
      });
    });
  });

  describe('processQuotedContent', () => {
    const sampleMessages: TestMessage[] = [
      { id: 'msg1', content: 'First message content' },
      { id: 'msg2', content: 'Second message here' },
      { id: 'msg3', content: 'Third message with more details' }
    ];

    describe('Basic Quoted Content Processing', () => {
      it('should handle messages without quotes', () => {
        const result = processQuotedContent('Regular message', sampleMessages);
        
        expect(result).toEqual({
          replyReference: null,
          contentToSend: 'Regular message'
        });
      });

      it('should extract quoted content from message', () => {
        const quotedMessage = '> First message content\nMy reply to this';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('My reply to this');
      });

      it('should handle quotes without matching messages', () => {
        const quotedMessage = '> Unknown quoted content\nMy reply';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe(null);
        expect(result.contentToSend).toBe('> Unknown quoted content\nMy reply');
      });

      it('should handle empty remaining content', () => {
        const quotedMessage = '> First message content';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe(' '); // Fallback space
      });
    });

    describe('Quoted Content Formatting', () => {
      it('should handle multiple quoted lines', () => {
        const quotedMessage = '> First message\n> content here\nMy response';
        const messagesWithMultiline = [
          { id: 'msg1', content: 'First message\ncontent here' }
        ];
        
        const result = processQuotedContent(quotedMessage, messagesWithMultiline);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('My response');
      });

      it('should handle quotes with extra spaces', () => {
        const quotedMessage = '>   First message content   \nMy reply';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('My reply');
      });

      it('should handle quotes without space after >', () => {
        const quotedMessage = '>First message content\nMy reply';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('My reply');
      });

      it('should stop at first non-quoted line', () => {
        const quotedMessage = '> First quoted line\n> Second quoted line\nNormal line\n> This should not be included\nReply content';
        const messagesWithMultiline = [
          { id: 'msg1', content: 'First quoted line\nSecond quoted line' }
        ];
        
        const result = processQuotedContent(quotedMessage, messagesWithMultiline);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('Normal line\n> This should not be included\nReply content');
      });
    });

    describe('Attachment Handling in Quotes', () => {
      it('should ignore attachment references in quotes', () => {
        const quotedMessage = '> Attachments: [file.pdf](url)\nMy reply';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe(null);
        expect(result.contentToSend).toBe('> Attachments: [file.pdf](url)\nMy reply');
      });

      it('should handle quotes that contain attachment sections', () => {
        const quotedMessage = '> Message with attachment\n> Attachments: [file.pdf](url)\nMy response';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe(null); // Should not match due to attachment
      });
    });

    describe('Duplicate Detection in Replies', () => {
      it('should detect duplicate reply content', () => {
        const quotedMessage = '> First message content\nFirst message content'; // Duplicate
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.isDuplicate).toBe(true);
      });

      it('should not mark non-duplicate replies', () => {
        const quotedMessage = '> First message content\nUnique reply content';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.isDuplicate).toBeUndefined();
      });

      it('should handle fuzzy duplicate detection in replies', () => {
        const quotedMessage = '> First message content\nFirst message'; // Fuzzy match
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.isDuplicate).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty message content', () => {
        const result = processQuotedContent('', sampleMessages);
        
        expect(result).toEqual({
          replyReference: null,
          contentToSend: ''
        });
      });

      it('should handle null/undefined inputs', () => {
        expect(processQuotedContent(null as any, sampleMessages)).toEqual({
          replyReference: null,
          contentToSend: null
        });
        
        expect(processQuotedContent('test', null as any)).toEqual({
          replyReference: null,
          contentToSend: 'test'
        });
      });

      it('should handle empty messages array', () => {
        const quotedMessage = '> Some quoted content\nReply';
        const result = processQuotedContent(quotedMessage, []);
        
        expect(result).toEqual({
          replyReference: null,
          contentToSend: '> Some quoted content\nReply'
        });
      });

      it('should handle messages without IDs', () => {
        const messagesNoId = [{ content: 'First message content' }];
        const quotedMessage = '> First message content\nReply';
        
        const result = processQuotedContent(quotedMessage, messagesNoId);
        
        expect(result.replyReference).toBe(null); // No ID to reference
      });

      it('should handle complex whitespace in quotes', () => {
        const quotedMessage = '>   \n>  First message content  \n>   \nReply content';
        const result = processQuotedContent(quotedMessage, sampleMessages);
        
        expect(result.replyReference).toBe('msg1');
        expect(result.contentToSend).toBe('Reply content');
      });
    });

    describe('Real-world Discord Scenarios', () => {
      it('should handle typical Discord reply format', () => {
        const discordReply = '> Original message here\nMy response to this message';
        const messages = [{ id: 'discord1', content: 'Original message here' }];
        
        const result = processQuotedContent(discordReply, messages);
        
        expect(result.replyReference).toBe('discord1');
        expect(result.contentToSend).toBe('My response to this message');
      });

      it('should handle quotes with user mentions', () => {
        const quotedMessage = '> <@123456789> said something\nMy reply';
        const messages = [{ id: 'mention1', content: '<@123456789> said something' }];
        
        const result = processQuotedContent(quotedMessage, messages);
        
        expect(result.replyReference).toBe('mention1');
      });

      it('should handle nested quotes (quote within quote)', () => {
        const nestedQuote = '> > Original quote\n> User replied\nMy response';
        const messages = [{ id: 'nested1', content: '> Original quote\nUser replied' }];
        
        const result = processQuotedContent(nestedQuote, messages);
        
        expect(result.replyReference).toBe('nested1');
        expect(result.contentToSend).toBe('My response');
      });
    });
  });

  describe('Module Exports', () => {
    it('should export named functions correctly', () => {
      expect(typeof isDuplicateMessage).toBe('function');
      expect(typeof removeAttachmentSection).toBe('function');
      expect(typeof processQuotedContent).toBe('function');
    });

    it('should export default object with all utilities', () => {
      expect(typeof messageUtils).toBe('object');
      expect(typeof messageUtils.isDuplicateMessage).toBe('function');
      expect(typeof messageUtils.removeAttachmentSection).toBe('function');
      expect(typeof messageUtils.processQuotedContent).toBe('function');
    });

    it('should have consistent behavior between named and default exports', () => {
      const messages = [{ content: 'test message' }];
      
      const namedResult = isDuplicateMessage(messages, 'test message');
      const defaultResult = messageUtils.isDuplicateMessage(messages, 'test message');
      
      expect(namedResult).toBe(defaultResult);
    });
  });
});