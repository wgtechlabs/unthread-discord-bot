/**
 * Message Utilities - Bidirectional Sync Processing
 *
 * @description
 * Critical message processing utilities for Discord-Unthread synchronization.
 * Prevents duplicate messages, handles attachments, processes quoted content,
 * and maintains message context during bidirectional platform communication.
 *
 * @module utils/messageUtils
 * @since 1.0.0
 *
 * @keyFunctions
 * - isDuplicateMessage(): Prevents message synchronization loops and redundancy
 * - containsDiscordAttachments(): Detects attachments requiring special processing
 * - removeAttachmentSection(): Cleans metadata for content comparison
 * - processQuotedContent(): Handles reply chains and quoted message threading
 *
 * @commonIssues
 * - Infinite sync loops: Duplicate detection fails causing message ping-pong
 * - Attachment processing errors: URL patterns not matching or content detection failing
 * - Quote parsing failures: Reply chain context lost during message threading
 * - Content normalization problems: Similar messages not recognized as duplicates
 * - Performance degradation: Message processing taking too long with large content
 *
 * @troubleshooting
 * - Monitor LogEngine for duplicate detection patterns and false positives
 * - Test attachment URL patterns against Discord CDN format changes
 * - Verify quote processing maintains proper threading context
 * - Check content normalization doesn't remove important message distinctions
 * - Profile message processing time for performance optimization
 * - Use debug logging to trace sync loop prevention logic
 *
 * @performance
 * - Duplicate detection optimized for common message patterns
 * - Attachment processing uses efficient regex patterns
 * - Quote processing minimizes string manipulation overhead
 * - Content normalization balances accuracy with performance
 *
 * @dependencies LogEngine for structured logging and debugging
 *
 * @example Basic Usage
 * ```typescript
 * const isDupe = isDuplicateMessage(newMessage, existingMessage);
 * if (isDupe) {
 *   LogEngine.debug('Skipping duplicate message sync');
 *   return;
 * }
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Full message processing pipeline
 * if (!isDuplicateMessage(message, lastSyncedMessage)) {
 *   const hasAttachments = containsDiscordAttachments(message.content);
 *   const processedQuotes = processQuotedContent(message.content);
 *   await syncToUnthread(processedQuotes, hasAttachments);
 * }
 * ```
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
 * @param messages - Array of messages to check against
 * @param newContent - The new message content to check
 * @returns True if the message is a duplicate, false otherwise
 *
 * @example
 * ```typescript
 * const isDupe = isDuplicateMessage(existingMessages, "Hello world");
 * if (isDupe) {
 *   console.log("Message already exists");
 * }
 * ```
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

	// Check for exact content match (case-sensitive)
	const exactDuplicate = messages.some(msg => msg.content === trimmedContent);
	if (exactDuplicate) {
		LogEngine.debug('Exact duplicate message detected');
		return true;
	}

	// Check for content containment (handles forum post content that may have extra formatting)
	// Only apply fuzzy matching for messages with sufficient content
	if (trimmedContent.length >= 10) {
		const contentDuplicate = messages.some(msg => {
			// First check if this is just a case difference (no fuzzy matching for that)
			const originalContent = msg.content.trim();
			if (originalContent.toLowerCase() === trimmedContent.toLowerCase() && originalContent !== trimmedContent) {
				return false;
			}

			// Normalize whitespace and case for fuzzy comparison
			const strippedMsg = msg.content.replace(/\s+/g, ' ').trim().toLowerCase();
			const strippedNewContent = trimmedContent.replace(/\s+/g, ' ').trim().toLowerCase();

			// Check if new content is contained in existing message
			if (strippedMsg.includes(strippedNewContent)) {
				// Ensure reasonable length ratio to avoid false positives
				const ratio = strippedNewContent.length / strippedMsg.length;
				if (ratio >= 0.3) {
					return true;
				}
			}

			// Check if existing message is contained in new content
			if (strippedNewContent.includes(strippedMsg)) {
				// Ensure reasonable length ratio to avoid false positives
				const ratio = strippedMsg.length / strippedNewContent.length;
				if (ratio >= 0.3) {
					return true;
				}
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
 *
 * @example
 * ```typescript
 * const cleanContent = removeAttachmentSection(
 *   "Hello world\n\nAttachments: [image.png](https://cdn.discordapp.com/...)"
 * );
 * // Returns: "Hello world"
 * ```
 */
function removeAttachmentSection(messageContent: string): string {
	if (!messageContent) return '';

	// Split content into sections and filter out attachment sections
	const sections = messageContent.split(/\n\n/);
	const filteredSections = sections.filter(section => {
		// Remove sections that start with "Attachments:"
		return !section.trim().startsWith('Attachments:');
	});

	// Join the remaining sections back together
	const processedContent = filteredSections.join('\n\n');

	// Also remove inline attachment patterns
	const attachmentPatterns = [
		// Inline attachments in angle brackets with pipe separator
		/ <[^>|]+\|[^>]+>/g,
		// Markdown-style attachment links preceded by "and"
		/ and \[[^\]]+\]\([^)]+\)/g,
		// Standalone markdown attachment links
		/ \[[^\]]+\]\([^)]+\)/g,
	];

	let finalContent = processedContent;
	for (const pattern of attachmentPatterns) {
		finalContent = finalContent.replace(pattern, '');
	}

	return finalContent.trim();
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
 * @param existingMessages - Array of existing messages to match against
 * @returns Object containing reply reference, content to send, and duplicate status
 *
 * @example
 * ```typescript
 * const result = processQuotedContent(
 *   "> Original message\nMy reply",
 *   existingMessages
 * );
 * if (result.replyReference) {
 *   console.log(`Replying to message: ${result.replyReference}`);
 * }
 * ```
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

	// Try to find the quoted message in existing messages using normalized content
	const matchingMsg = existingMessages.find(msg =>
		removeAttachmentSection(msg.content).trim() === removeAttachmentSection(quotedMessage).trim(),
	);
	if (matchingMsg && matchingMsg.id) {
		result.replyReference = matchingMsg.id;
		// Empty message fallback
		result.contentToSend = remainingText || ' ';

		// Check if the remaining text is a duplicate
		// (Prevents duplicate replies)
		if (isDuplicateMessage(existingMessages, remainingText)) {
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
	removeAttachmentSection,
	processQuotedContent,
};

export default messageUtils;

// Export individual functions for named imports
export { isDuplicateMessage, removeAttachmentSection, processQuotedContent };