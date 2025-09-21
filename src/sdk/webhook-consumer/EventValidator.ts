/**
 * Webhook Event Validator
 *
 * Validates incoming webhook events from the Unthread platform to ensure data
 * integrity and security. Performs comprehensive validation of event structure,
 * content, and source before allowing event processing.
 *
 * @module sdk/webhook-consumer/EventValidator
 */

import { LogEngine } from '../../config/logger';
import { WebhookPayload } from '../../types/unthread';

export class EventValidator {
	/**
	 * Validate webhook event structure and content
	 *
	 * @param event - The webhook event to validate
	 * @returns True if the event is valid and should be processed
	 */
	static validate(event: unknown): event is WebhookPayload {
		// Basic structure validation
		if (!event || typeof event !== 'object') {
			LogEngine.warn('Event validation failed: Invalid event object');
			return false;
		}

		const eventObj = event as Record<string, unknown>;

		// Validate platform field
		if (!eventObj.platform || typeof eventObj.platform !== 'string' || !eventObj.platform.trim()) {
			LogEngine.warn('Event validation failed: Missing or invalid field "platform"');
			return false;
		}

		// Validate targetPlatform field
		if (!eventObj.targetPlatform || typeof eventObj.targetPlatform !== 'string' || !eventObj.targetPlatform.trim()) {
			LogEngine.warn('Event validation failed: Missing or invalid field "targetPlatform"');
			return false;
		}

		// Validate type field
		if (!eventObj.type || typeof eventObj.type !== 'string' || !eventObj.type.trim()) {
			LogEngine.warn('Event validation failed: Missing or invalid field "type"');
			return false;
		}

		// Validate sourcePlatform field
		if (!eventObj.sourcePlatform || typeof eventObj.sourcePlatform !== 'string' || !eventObj.sourcePlatform.trim()) {
			LogEngine.warn('Event validation failed: Missing or invalid field "sourcePlatform"');
			return false;
		}

		// Validate timestamp field
		if (!eventObj.timestamp || typeof eventObj.timestamp !== 'string' || !eventObj.timestamp.trim()) {
			LogEngine.warn('Event validation failed: Missing or invalid field "timestamp"');
			return false;
		}

		// Basic timestamp sanity check
		if (Number.isNaN(Date.parse(eventObj.timestamp))) {
			LogEngine.warn('Event validation failed: Invalid timestamp format');
			return false;
		}

		if (!eventObj.data || typeof eventObj.data !== 'object') {
			LogEngine.warn('Event validation failed: Missing or invalid event data');
			return false;
		}

		// Validate supported event types (updated to match actual webhook server output)
		const supportedEvents = new Set(['message_created', 'conversation_updated', 'conversation_created']);
		if (!supportedEvents.has(eventObj.type)) {
			LogEngine.debug(`Unsupported event type: ${eventObj.type}`);
			return false;
		}

		// Event-specific validation
		const data = eventObj.data as Record<string, unknown>;

		if (eventObj.type === 'message_created') {
			// Message events must have conversation ID and content or attachments
			const hasConversationId = !!(data.conversationId || data.id);
			const hasContent = !!(data.text || data.content || data.markdown);

			if (!hasConversationId) {
				LogEngine.warn('Message event validation failed: Missing conversation ID');
				return false;
			}

			// Allow messages without text content if they have attachments
			// This is common for image/file-only messages
			if (!hasContent) {
				LogEngine.debug('Message event has no text content - may be attachment-only');
			}

			return true;
		}

		if (eventObj.type === 'conversation_updated') {
			// Status update events must have conversation ID and status
			const hasConversationId = !!(data.conversationId || data.id);
			const hasStatus = !!data.status;

			if (!hasConversationId || !hasStatus) {
				LogEngine.warn('Conversation update validation failed: Missing conversation ID or status');
				return false;
			}

			return true;
		}

		if (eventObj.type === 'conversation_created') {
			// Conversation creation events must have conversation ID
			const hasConversationId = !!(data.conversationId || data.id);

			if (!hasConversationId) {
				LogEngine.warn('Conversation creation validation failed: Missing conversation ID');
				return false;
			}

			return true;
		}

		// Event type not explicitly handled but passed validation - this shouldn't happen
		LogEngine.warn(`Event type '${eventObj.type}' passed validation but has no specific handler`);
		return false;
	}

	/**
	 * Extract conversation ID from event data
	 *
	 * @param data - Event data object
	 * @returns Conversation ID or null if not found
	 */
	static extractConversationId(data: unknown): string | null {
		if (!data || typeof data !== 'object') {
			return null;
		}

		const eventData = data as Record<string, unknown>;

		// Try different possible field names
		if (typeof eventData.conversationId === 'string') {
			return eventData.conversationId;
		}

		if (typeof eventData.id === 'string') {
			return eventData.id;
		}

		return null;
	}
}