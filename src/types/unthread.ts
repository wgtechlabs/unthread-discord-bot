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
	id: string;
	name: string;
	email: string;
	discord_user_id?: string;
	created_at: string;
	updated_at: string;
}

/**
 * Request payload for creating a new customer
 */
export interface CreateCustomerRequest {
	name: string;
	email: string;
	discord_user_id?: string;
}

/**
 * Represents a ticket in the Unthread system
 */
export interface UnthreadTicket {
	id: string;
	friendlyId: string;
	title: string;
	status: TicketStatus;
	priority: TicketPriority;
	customer_id: string;
	channel_id: string;
	created_at: string;
	updated_at: string;
	last_message_at?: string;
}

/**
 * Request payload for creating a new ticket
 */
export interface CreateTicketRequest {
	title: string;
	channel_id: string;
	customer_id: string;
	priority?: TicketPriority;
	initial_message?: string;
}

/**
 * Represents a message in the Unthread system
 */
export interface UnthreadMessage {
	id: string;
	ticket_id: string;
	content: string;
	author_type: 'customer' | 'agent';
	author_id: string;
	created_at: string;
	attachments?: MessageAttachment[];
}

/**
 * Request payload for creating a new message
 */
export interface CreateMessageRequest {
	content: string;
	author_type: 'customer' | 'agent';
	author_id: string;
	attachments?: MessageAttachment[];
}

/**
 * Represents an attachment in a message
 */
export interface MessageAttachment {
	filename: string;
	url: string;
	content_type: string;
	size: number;
}

/**
 * Available ticket statuses in Unthread
 */
export type TicketStatus = 'open' | 'pending' | 'solved' | 'closed';

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
	| 'message.updated';

/**
 * Base webhook payload structure
 */
export interface WebhookPayload {
	event: WebhookEventType;
	timestamp: string;
	data: UnthreadTicket | UnthreadMessage;
}

/**
 * Ticket webhook payload
 */
export interface TicketWebhookPayload extends WebhookPayload {
	event: 'ticket.created' | 'ticket.updated' | 'ticket.solved' | 'ticket.closed';
	data: UnthreadTicket;
}

/**
 * Message webhook payload
 */
export interface MessageWebhookPayload extends WebhookPayload {
	event: 'message.created' | 'message.updated';
	data: UnthreadMessage;
}

/**
 * API response wrapper for Unthread endpoints
 */
export interface UnthreadApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}