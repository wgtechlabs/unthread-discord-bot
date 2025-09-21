/**
 * Utility Type Definitions
 *
 * Contains common utility types and interfaces used across the application.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * These types ensure consistency and type safety throughout the codebase.
 * When creating new utility functions or API integrations, check here first
 * for existing types that might be reusable.
 *
 * 🔧 TYPE CATEGORIES:
 * ==================
 * - Retry Types: Configuration for retry operations
 * - API Types: Common request/response structures
 * - File Types: Attachment and file handling
 * - Pagination Types: For paginated API responses
 * - Database Types: Common database operation results
 *
 * 💡 BEST PRACTICES:
 * =================
 * - Use generic types for reusability (ApiResponse<T>, DatabaseResult<T>)
 * - Document complex types with inline comments
 * - Export types for use in other modules
 * - Keep utility types simple and focused
 * - Prefer composition over inheritance for complex types
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
	body?: Record<string, unknown>;
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
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	statusCode?: number;
}

/**
 * Database operation result
 */
export interface DatabaseResult<T = unknown> {
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
	data?: Buffer;
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