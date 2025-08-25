/**
 * Message Utilities Module
 *
 * This module provides utility functions for processing messages between Discord and Unthread,
 * including duplicate detection, attachment handling, and message formatting.
 *
 * These utilities help ensure consistent message handling and prevent duplicate messages
 * from being synchronized between platforms, which can happen due to bidirectional sync.
 *
 * @module utils/messageUtils
 */

import { LogEngine } from '../config/logger';

/**
 * Represents a message for processing
 */
interface ProcessableMessage {
	content: string;
	id?: string;
}

/**
 * Result of processing quoted content
 */
interface QuotedContentResult {
	replyReference: string | null;
	contentToSend: string;
	isDuplicate?: boolean;
}

/**
 * Checks if a message content is a duplicate of any message in a collection
 *
 * This function performs two types of checks:
 * 1. Exact duplicate: The message content matches exactly
 * 2. Fuzzy duplicate: The message content is contained within another message
 *    or vice versa (common with forum posts that have different formatting)
 *
 * @param messages - Array or Discord.js Collection of messages
 * @param newContent - The new message content to check
 * @returns True if the message is a duplicate, false otherwise
 */
function isDuplicateMessage(messages: ProcessableMessage[], newContent: string): boolean {
	// Early return if no content to check
	if (!newContent || !messages || messages.length === 0) {
		return false;
	}

	const trimmedContent = newContent.trim();

	// Skip duplicate checks for very short messages (less than 5 chars)
	// These are more likely to trigger false positives
	if (trimmedContent.length < 5) {
		return false;
	}

	// Check for exact content match
	const exactDuplicate = messages.some(msg => msg.content === trimmedContent);
	if (exactDuplicate) {
		LogEngine.debug('Exact duplicate message detected');
		return true;
	}

	// Check for content containment (handles forum post content that may have extra formatting)
	// Only apply fuzzy matching for messages with sufficient content
	if (trimmedContent.length >= 10) {
		const contentDuplicate = messages.some(msg => {
			// Normalize whitespace for comparison
			const strippedMsg = msg.content.replace(/\s+/g, ' ').trim();
			const strippedNewContent = trimmedContent.replace(/\s+/g, ' ').trim();

			// Only consider it a duplicate if one contains the other AND
			// they're relatively close in length (to avoid false positives)
			if (strippedMsg.includes(strippedNewContent) &&
				strippedMsg.length <= strippedNewContent.length * 1.5) {
				return true;
			}

			if (strippedNewContent.includes(strippedMsg) &&
				strippedNewContent.length <= strippedMsg.length * 1.5) {
				return true;
			}

			return false;
		});

		if (contentDuplicate) {
			LogEngine.debug('Content duplicate message detected (fuzzy match)');
			return true;
		}
	}

	return false;
}

/**
 * Checks if a message contains Discord attachment links
 *
 * Discord attachments can be represented in various formats in messages:
 * - Markdown links with Discord CDN URLs
 * - Specially formatted attachment references with image/video/file prefixes
 * - Plain URLs to the Discord CDN
 *
 * This function detects these patterns to prevent duplicate attachments from
 * being synchronized between platforms.
 *
 * @param messageContent - Message content to check
 * @returns True if the message contains Discord attachments, false otherwise
 */
function containsDiscordAttachments(messageContent: string): boolean {
	if (!messageContent) return false;

	// Discord CDN attachment pattern - handles various Discord attachment formats
	const discordCdnPattern = /Attachments: (?:<https:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/[^>]+\|(?:image|video|file)_\d+>|\[(?:image|video|file)_\d+\]https:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/[^\]]+\))/i;

	// Basic pattern check
	if (discordCdnPattern.test(messageContent)) {
		return true;
	}

	// More comprehensive check for various formats
	// These are the common markers for Discord attachments in synchronized messages
	if (messageContent.includes('Attachments:') &&
		messageContent.includes('cdn.discordapp.com/attachments/') &&
		(messageContent.includes('|image_') || messageContent.includes('|file_') || messageContent.includes('|video_'))) {
		return true;
	}

	return false;
}

/**
 * Removes attachment sections from message content
 *
 * When messages are synchronized between platforms, attachments are often
 * represented as special sections at the end of messages. This function
 * strips these sections to enable cleaner content comparison.
 *
 * This is particularly useful when:
 * - Comparing message content for duplicate detection
 * - Processing quoted replies where we want to match only the text
 * - Checking if a message has meaningful content besides attachments
 *
 * @param messageContent - Message content to process
 * @returns Message content without attachment sections
 */
function removeAttachmentSection(messageContent: string): string {
	if (!messageContent) return '';

	// Look for patterns like:
	//
	//  Attachments: [image_1]https://cdn.discordapp.com/...
	// or
	//  Attachments: <https://cdn.discordapp.com/...|image_1>
	const attachmentSection = messageContent.match(/\n\nAttachments: (?:\[.+\]|\<.+\>)/);
	if (attachmentSection) {
		return messageContent.replace(attachmentSection[0], '').trim();
	}
	return messageContent.trim();
}

/**
 * Processes quoted content in messages for proper reply handling
 *
 * In Discord, quoted messages often indicate replies. This function:
 * 1. Detects quoted content (lines beginning with >)
 * 2. Attempts to find the original message being quoted
 * 3. Returns info needed to format the message as a proper reply
 * 4. Checks if the reply content itself is a duplicate
 *
 * This improves the user experience by preserving conversation threading
 * between Discord and Unthread.
 *
 * @param messageContent - The message content to process
 * @param existingMessages - Collection of existing messages to match against
 * @returns Object containing reply reference, content to send, and duplicate status
 */
function processQuotedContent(
	messageContent: string,
	existingMessages: ProcessableMessage[],
): QuotedContentResult {
	if (!messageContent || !existingMessages || existingMessages.length === 0) {
		return { replyReference: null, contentToSend: messageContent };
	}

	const result: QuotedContentResult = {
		replyReference: null,
		contentToSend: messageContent,
	};

	// Look for quoted content (lines starting with >)
	// Use a safe string-based approach instead of regex to avoid ReDoS attacks
	const lines = messageContent.split('\n');
	const quotedLines: string[] = [];
	let foundQuotedContent = false;

	// Find consecutive lines starting with >
	for (const line of lines) {
		if (line.trim().startsWith('>')) {
			quotedLines.push(line);
			foundQuotedContent = true;
		}
		else if (foundQuotedContent) {
			// Stop at first non-quoted line after finding quoted content
			break;
		}
	}

	if (!foundQuotedContent) return result;

	// Extract the quoted portion and clean it up
	const quotedMessageRaw = quotedLines.join('\n');
	const quotedMessage = quotedLines
		.map(line => line.replace(/^>\s?/, '').trim())
		.join('\n')
		.trim();

	// Get the remainder of the message after the quoted section
	const remainingText = messageContent.replace(quotedMessageRaw, '').trim();

	// Don't process if it's an attachment reference
	// (These can sometimes look like quotes but shouldn't be processed as replies)
	if (quotedMessage.startsWith('Attachments: [')) {
		return result;
	}

	// Try to find the quoted message in existing messages
	const matchingMsg = existingMessages.find(msg => msg.content.trim() === quotedMessage);
	if (matchingMsg && matchingMsg.id) {
		result.replyReference = matchingMsg.id;
		// Empty message fallback
		result.contentToSend = remainingText || ' ';

		// Check if the remaining text is a duplicate in any message
		// (Prevents duplicate replies)
		const isDuplicate = existingMessages.some(msg => {
			const cleanContent = removeAttachmentSection(msg.content);
			return cleanContent === remainingText;
		});

		if (isDuplicate) {
			result.isDuplicate = true;
		}
	}

	return result;
}

/**
 * Message utility functions
 */
const messageUtils = {
	isDuplicateMessage,
	containsDiscordAttachments,
	removeAttachmentSection,
	processQuotedContent,
};

export default messageUtils;

// Export individual functions for named imports
export { isDuplicateMessage, containsDiscordAttachments, removeAttachmentSection, processQuotedContent };