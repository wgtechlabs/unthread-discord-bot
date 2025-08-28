/**
 * Unthread API Type Definitions
 *
 * Contains type definitions for all Unthread API request and response objects.
 * These interfaces ensure type safety when interacting with the Unthread service.
 *
 * @module types/unthread
 */

/**
 * Represents a customer in the Unthread system
 */
export interface UnthreadCustomer {
	/** Unique customer identifier in Unthread */
	id: string;
	/** Customer display name */
	name: string;
	/** Customer email address */
	email: string;
	/** Associated Discord user ID (optional) */
	discord_user_id?: string;
	/** Timestamp when customer was created */
	created_at: string;
	/** Timestamp when customer was last updated */
	updated_at: string;
}

/**
 * Request payload for creating a new customer
 */
export interface CreateCustomerRequest {
	/** Customer display name */
	name: string;
	/** Customer email address */
	email: string;
	/** Associated Discord user ID (optional) */
	discord_user_id?: string;
}

/**
 * Represents a ticket/conversation in the Unthread system
 *
 * This interface matches the actual API response from Unthread conversations endpoint.
 * Used for both ticket creation responses and webhook payloads.
 */
export interface UnthreadTicket {
	/** Unique ticket identifier in Unthread */
	id: string;
	/** Human-readable ticket number (e.g., "T-123") */
	friendlyId: string;
	/** Ticket title/subject */
	title: string;
	/** Current ticket status */
	status: TicketStatus;
	/** Ticket priority level */
	priority: TicketPriority;
	/** ID of the customer who created the ticket */
	customer_id: string;
	/** Slack/Discord channel ID where ticket is routed */
	channel_id: string;
	/** Timestamp when ticket was created */
	created_at: string;
	/** Timestamp when ticket was last updated */
	updated_at: string;
	/** Timestamp of the most recent message (optional) */
	last_message_at?: string;
	/** Ticket type (e.g., 'slack', 'email') */
	type?: string;
	/** Markdown content of the initial message */
	markdown?: string;
}

/**
 * Request payload for creating a new ticket/conversation
 */
export interface CreateTicketRequest {
	/** Ticket title/subject */
	title: string;
	/** Target channel ID for ticket routing */
	channel_id: string;
	/** Customer ID who is creating the ticket */
	customer_id: string;
	/** Ticket priority (optional, defaults to 'normal') */
	priority?: TicketPriority;
	/** Initial message content (optional) */
	initial_message?: string;
	/** Ticket type (e.g., 'slack', 'email') */
	type?: string;
	/** Markdown content for the ticket body */
	markdown?: string;
}

/**
 * Represents a message in the Unthread system
 */
export interface UnthreadMessage {
	/** Unique message identifier */
	id: string;
	/** ID of the ticket/conversation this message belongs to */
	ticket_id: string;
	/** Message text content */
	content: string;
	/** Type of message author (customer or agent) */
	author_type: 'customer' | 'agent';
	/** ID of the message author */
	author_id: string;
	/** Timestamp when message was created */
	created_at: string;
	/** File attachments in the message (optional) */
	attachments?: MessageAttachment[];
	/** Message metadata (optional) */
	metadata?: Record<string, unknown>;
	/** User ID who sent the message (for webhook events) */
	userId?: string;
	/** Conversation/ticket ID (alternative field name in webhooks) */
	conversationId?: string;
	/** Message text content (alternative field name) */
	text?: string;
}

/**
 * Request payload for creating a new message
 */
export interface CreateMessageRequest {
	/** Message text content */
	content: string;
	/** Type of message author (customer or agent) */
	author_type: 'customer' | 'agent';
	/** ID of the message author */
	author_id: string;
	/** File attachments to include (optional) */
	attachments?: MessageAttachment[];
	/** Message metadata (optional) */
	metadata?: Record<string, unknown>;
}

/**
 * Represents a file attachment in a message
 */
export interface MessageAttachment {
	/** Original filename */
	filename: string;
	/** URL where the file can be accessed */
	url: string;
	/** MIME type of the file */
	content_type: string;
	/** File size in bytes */
	size: number;
}

/**
 * Available ticket statuses in Unthread
 */
export type TicketStatus = 'open' | 'in_progress' | 'on_hold' | 'closed' | 'resolved';

/**
 * Available ticket priorities in Unthread
 */
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Webhook event types from Unthread
 */
export type WebhookEventType =
	| 'ticket.created'
	| 'ticket.updated'
	| 'ticket.solved'
	| 'ticket.closed'
	| 'message.created'
	| 'message.updated'
	| 'message_created'
	| 'conversation_updated'
	| 'conversation.created';

/**
 * Base webhook payload structure from Unthread
 *
 * All webhook events follow this structure with event-specific data.
 */
export interface WebhookPayload {
	/** Type of webhook event */
	event: WebhookEventType;
	/** ISO timestamp when the event occurred */
	timestamp: string;
	/** Event-specific data payload */
	data: UnthreadTicket | UnthreadMessage | Record<string, unknown>;
}

/**
 * Ticket-specific webhook payload
 */
export interface TicketWebhookPayload extends WebhookPayload {
	/** Ticket-related event types */
	event: 'ticket.created' | 'ticket.updated' | 'ticket.solved' | 'ticket.closed';
	/** Ticket data */
	data: UnthreadTicket;
}

/**
 * Message-specific webhook payload
 */
export interface MessageWebhookPayload extends WebhookPayload {
	/** Message-related event types */
	event: 'message.created' | 'message.updated';
	/** Message data */
	data: UnthreadMessage;
}

/**
 * API response wrapper for Unthread endpoints
 *
 * Standard response format returned by Unthread API calls.
 */
export interface UnthreadApiResponse<T> {
	/** Whether the API call was successful */
	success: boolean;
	/** Response data (present on success) */
	data?: T;
	/** Error message (present on failure) */
	error?: string;
	/** Additional descriptive message */
	message?: string;
}