/**
 * Utility Type Definitions
 *
 * Contains common utility types and interfaces used across the application.
 *
 * @module types/utils
 */

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
	maxAttempts: number;
	delay: number;
	backoff?: boolean;
}

/**
 * API request configuration
 */
export interface ApiRequestConfig {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	url: string;
	headers?: Record<string, string>;
	body?: any;
	timeout?: number;
}

/**
 * Message processing result
 */
export interface MessageProcessingResult {
	processed: boolean;
	isDuplicate: boolean;
	hasAttachments: boolean;
	cleanContent?: string;
}

/**
 * Generic API response structure
 */
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	statusCode?: number;
}

/**
 * Database operation result
 */
export interface DatabaseResult<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	rowsAffected?: number;
}

/**
 * File attachment information
 */
export interface FileAttachment {
	filename: string;
	url: string;
	size: number;
	contentType: string;
	// Buffer type will be available once Node.js types are properly loaded
	data?: any;
}

/**
 * Environment validation result
 */
export interface EnvironmentValidation {
	valid: boolean;
	missing: string[];
	warnings: string[];
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
	page: number;
	limit: number;
	offset?: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}