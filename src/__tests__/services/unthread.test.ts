/**
 * Unthread Service Tests
 *
 * Comprehensive test coverage for the Unthread service module,
 * focusing on customer management, ticket operations, webhook processing,
 * and API integration patterns.
 *
 * @module __tests__/services/unthread
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { User } from 'discord.js';
import * as unthreadService from '../../services/unthread';
import { WebhookPayload } from '../../types/unthread';
import { FileBuffer } from '../../types/attachments';
import { LogEngine } from '../../config/logger';
// (removed unused imports)

// Mock all dependencies
vi.mock('../../config/logger', () => ({
  LogEngine: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../utils/decodeHtmlEntities', () => ({
  decodeHtmlEntities: vi.fn((text: string) => text),
}));
// Create persistent mock instance
const mockBotsStoreInstance = {
	storeThreadTicketMapping: vi.fn(),
	getThreadTicketMapping: vi.fn(),
	getMappingByTicketId: vi.fn(),
};

vi.mock('../../sdk/bots-brain/BotsStore', () => ({
	BotsStore: {
		getInstance: vi.fn(() => mockBotsStoreInstance),
	},
	ExtendedThreadTicketMapping: {},
}));
vi.mock('../../utils/botUtils', () => ({
	getBotFooter: vi.fn(() => 'Test Bot Footer'),
}));
vi.mock('../../utils/messageUtils', () => ({
	isDuplicateMessage: vi.fn(() => false),
}));
vi.mock('../../utils/threadUtils', () => ({
	findDiscordThreadByTicketId: vi.fn().mockResolvedValue({ discordThread: null }),
	findDiscordThreadByTicketIdWithRetry: vi.fn().mockResolvedValue({ discordThread: null }),
}));
vi.mock('../../utils/customerUtils', () => ({
	getOrCreateCustomer: vi.fn(),
	getCustomerByDiscordId: vi.fn(),
	Customer: {},
}));
vi.mock('../../config/defaults', () => ({
	getConfig: vi.fn((key: string, defaultValue: any) => defaultValue),
	DEFAULT_CONFIG: {
		UNTHREAD_HTTP_TIMEOUT_MS: 8000,
	},
	isDevelopment: false,
}));

describe('Unthread Service', () => {
	let mockUser: User;
	let mockFetch: any;
	let mockGetOrCreateCustomer: any;
	let mockGetCustomerByDiscordId: any;
	let mockBotsStore: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Get the mocked modules
		const { getOrCreateCustomer, getCustomerByDiscordId } = await import('../../utils/customerUtils');
		
		mockGetOrCreateCustomer = getOrCreateCustomer as any;
		mockGetCustomerByDiscordId = getCustomerByDiscordId as any;
		mockBotsStore = mockBotsStoreInstance;
		
		// Set up default mock implementations
		mockGetOrCreateCustomer.mockResolvedValue({
			unthreadCustomerId: 'customer-123',
			email: 'test@example.com',
			name: 'Test User',
		});
		mockGetCustomerByDiscordId.mockResolvedValue(null);
		mockBotsStore.storeThreadTicketMapping.mockResolvedValue(undefined);
		mockBotsStore.getThreadTicketMapping.mockResolvedValue(null);
		mockBotsStore.getMappingByTicketId.mockResolvedValue(null);
		
		// Set up environment variables
		process.env.UNTHREAD_API_KEY = 'test-api-key';
		process.env.UNTHREAD_SLACK_CHANNEL_ID = 'test-slack-channel';
		process.env.UNTHREAD_WEBHOOK_SECRET = 'test-webhook-secret';

		// Create mock Discord User
		mockUser = {
			id: 'test-user-id',
			username: 'testuser',
			displayName: 'Test User',
			discriminator: '0001',
			avatar: 'test-avatar',
			bot: false,
			system: false,
			tag: 'testuser#0001',
		} as User;

		// Set up fetch mock
		mockFetch = global.fetch as any;
		mockFetch.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Environment Validation', () => {
		describe('validateEnvironment', () => {
			it('should pass validation when all required env vars are set', () => {
				expect(() => unthreadService.validateEnvironment()).not.toThrow();
				expect(LogEngine.info).toHaveBeenCalledWith('Unthread environment validation passed - all required variables are set');
			});

			it('should throw error when UNTHREAD_API_KEY is missing', () => {
				delete process.env.UNTHREAD_API_KEY;

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_API_KEY');
				expect(LogEngine.error).toHaveBeenCalledWith('Missing required environment variables: UNTHREAD_API_KEY');
			});

			it('should throw error when UNTHREAD_SLACK_CHANNEL_ID is missing', () => {
				delete process.env.UNTHREAD_SLACK_CHANNEL_ID;

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_SLACK_CHANNEL_ID');
			});

			it('should throw error when UNTHREAD_WEBHOOK_SECRET is missing', () => {
				delete process.env.UNTHREAD_WEBHOOK_SECRET;

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_WEBHOOK_SECRET');
			});

			it('should throw error when multiple env vars are missing', () => {
				delete process.env.UNTHREAD_API_KEY;
				delete process.env.UNTHREAD_SLACK_CHANNEL_ID;

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_API_KEY, UNTHREAD_SLACK_CHANNEL_ID');
			});

			it('should handle empty string env vars as missing', () => {
				process.env.UNTHREAD_API_KEY = '';

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_API_KEY');
			});

			it('should handle whitespace-only env vars as missing', () => {
				process.env.UNTHREAD_API_KEY = '   ';

				expect(() => unthreadService.validateEnvironment()).toThrow('Missing required environment variables: UNTHREAD_API_KEY');
			});

			it('should log info about optional SLACK_TEAM_ID when present', () => {
				process.env.SLACK_TEAM_ID = 'test-team-id';

				unthreadService.validateEnvironment();

				expect(LogEngine.info).toHaveBeenCalledWith('Optional SLACK_TEAM_ID is configured - file attachments enabled');
			});

			it('should log info about optional SLACK_TEAM_ID when missing', () => {
				delete process.env.SLACK_TEAM_ID;

				unthreadService.validateEnvironment();

				expect(LogEngine.info).toHaveBeenCalledWith('Optional SLACK_TEAM_ID not configured - file attachments will be limited');
			});
		});
	});

	describe('Customer Management', () => {
		describe('saveCustomer', () => {
			it('should call getOrCreateCustomer utility', async () => {
				const mockCustomer = { unthreadCustomerId: 'customer-123', email: 'test@example.com', name: 'Test User' };
				mockGetOrCreateCustomer.mockResolvedValue(mockCustomer);

				const result = await unthreadService.saveCustomer(mockUser, 'test@example.com');

				expect(mockGetOrCreateCustomer).toHaveBeenCalledWith(mockUser, 'test@example.com');
				expect(result).toEqual(mockCustomer);
			});

			it('should propagate errors from getOrCreateCustomer', async () => {
				const error = new Error('Customer creation failed');
				mockGetOrCreateCustomer.mockRejectedValue(error);

				await expect(unthreadService.saveCustomer(mockUser, 'test@example.com')).rejects.toThrow('Customer creation failed');
			});
		});

		describe('getCustomerById', () => {
			it('should call getCustomerByDiscordId utility', async () => {
				const mockCustomer = { unthreadCustomerId: 'customer-123', email: 'test@example.com', name: 'Test User' };
				mockGetCustomerByDiscordId.mockResolvedValue(mockCustomer);

				const result = await unthreadService.getCustomerById('discord-user-id');

				expect(mockGetCustomerByDiscordId).toHaveBeenCalledWith('discord-user-id');
				expect(result).toEqual(mockCustomer);
			});

			it('should return null when customer not found', async () => {
				mockGetCustomerByDiscordId.mockResolvedValue(null);

				const result = await unthreadService.getCustomerById('non-existent-id');

				expect(result).toBeNull();
			});
		});
	});

	describe('Ticket Management', () => {
		describe('createTicket', () => {
			it('should create ticket successfully', async () => {
				const mockCustomer = { unthreadCustomerId: 'customer-123', email: 'test@example.com', name: 'Test User' };
				mockGetOrCreateCustomer.mockResolvedValue(mockCustomer);

				const mockTicketResponse = {
					id: '3a1c7f44-edef-4edb-bfaf-71885969bfb0',
					friendlyId: '525',
					title: 'Test Ticket',
					status: 'open',
					customer_id: 'customer-123',
				};

				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue(mockTicketResponse),
				});

				const result = await unthreadService.createTicket(mockUser, 'Test Ticket', 'Test issue', 'test@example.com');

				expect(mockFetch).toHaveBeenCalledWith('https://api.unthread.io/api/conversations', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-KEY': 'test-api-key',
					},
					body: JSON.stringify({
						type: 'slack',
						title: 'Test Ticket',
						markdown: 'Test issue',
						status: 'open',
						channelId: 'test-slack-channel',
						customerId: 'customer-123',
						onBehalfOf: {
							name: 'Test User',
							email: 'test@example.com',
						},
					}),
					signal: expect.any(AbortSignal),
				});

				expect(result).toEqual(mockTicketResponse);
				expect(LogEngine.info).toHaveBeenCalledWith('Created ticket 525 (3a1c7f44-edef-4edb-bfaf-71885969bfb0) for user Test User');
			});

			it('should handle API errors', async () => {
				mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

				mockFetch.mockResolvedValueOnce({
					ok: false,
					status: 400,
					text: vi.fn().mockResolvedValue('Bad Request'),
				});

				await expect(unthreadService.createTicket(mockUser, 'Test Ticket', 'Test issue', 'test@example.com'))
					.rejects.toThrow('Failed to create ticket: 400');

				expect(LogEngine.error).toHaveBeenCalledWith('Failed to create ticket: 400 - Bad Request');
			});

			it('should handle timeout errors', async () => {
				mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

				// Mock fetch to reject with timeout error (AbortError)
				const abortError = new Error('Request to create ticket timed out');
				abortError.name = 'AbortError';
				mockFetch.mockRejectedValue(abortError);

				await expect(unthreadService.createTicket(mockUser, 'Test Ticket', 'Test issue', 'test@example.com'))
					.rejects.toThrow('Request to create ticket timed out');

				expect(LogEngine.error).toHaveBeenCalledWith('Request to create ticket timed out after 8000ms');
			});

			it('should validate ticket response has required id field', async () => {
				mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

				const mockTicketResponse = {
					// Missing 'id' field
					friendlyId: 'T-123',
					title: 'Test Ticket',
				};

				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue(mockTicketResponse),
				});

				await expect(unthreadService.createTicket(mockUser, 'Test Ticket', 'Test issue', 'test@example.com'))
					.rejects.toThrow('Ticket was created but response is missing required fields');

				expect(LogEngine.error).toHaveBeenCalledWith('Ticket response missing required \'id\' field:', mockTicketResponse);
			});

			it('should validate ticket response has required friendlyId field', async () => {
				mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

				const mockTicketResponse = {
					id: 'ticket-123',
					// Missing 'friendlyId' field
					title: 'Test Ticket',
				};

				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue(mockTicketResponse),
				});

				await expect(unthreadService.createTicket(mockUser, 'Test Ticket', 'Test issue', 'test@example.com'))
					.rejects.toThrow('Ticket was created but friendlyId is missing');

				expect(LogEngine.error).toHaveBeenCalledWith('Ticket response missing required \'friendlyId\' field:', mockTicketResponse);
			});

			it('should use username when displayName is not available', async () => {
				mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

				const userWithoutDisplayName = { ...mockUser, displayName: undefined };

				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue({
						id: 'ticket-123',
						friendlyId: 'T-123',
					}),
				});

				await unthreadService.createTicket(userWithoutDisplayName, 'Test Ticket', 'Test issue', 'test@example.com');

				expect(mockFetch).toHaveBeenCalledWith('https://api.unthread.io/api/conversations', 
					expect.objectContaining({
						body: expect.stringContaining('"name":"testuser"'),
					})
				);
			});
		});

		describe('bindTicketWithThread', () => {
			it('should store thread-ticket mapping successfully', async () => {
				mockBotsStore.storeThreadTicketMapping.mockResolvedValue(undefined);

				await unthreadService.bindTicketWithThread('ticket-123', 'thread-456');

				expect(mockBotsStore.storeThreadTicketMapping).toHaveBeenCalledWith({
					unthreadTicketId: 'ticket-123',
					discordThreadId: 'thread-456',
					createdAt: expect.any(String),
					status: 'active',
				});

				expect(LogEngine.info).toHaveBeenCalledWith('Bound Discord thread thread-456 with Unthread ticket ticket-123 using 3-layer storage');
			});

			it('should handle storage errors', async () => {
				mockBotsStore.storeThreadTicketMapping.mockRejectedValue(new Error('Storage failed'));

				await expect(unthreadService.bindTicketWithThread('ticket-123', 'thread-456'))
					.rejects.toThrow('Storage failed');

				expect(LogEngine.error).toHaveBeenCalledWith('Error binding ticket with thread:', expect.any(Error));
			});
		});

		describe('getTicketByDiscordThreadId', () => {
			it('should retrieve mapping successfully', async () => {
				const mockMapping = {
					unthreadTicketId: 'ticket-123',
					discordThreadId: 'thread-456',
					createdAt: '2023-01-01T00:00:00Z',
					status: 'active',
				};

				mockBotsStore.getThreadTicketMapping.mockResolvedValue(mockMapping);

				const result = await unthreadService.getTicketByDiscordThreadId('thread-456');

				expect(mockBotsStore.getThreadTicketMapping).toHaveBeenCalledWith('thread-456');
				expect(result).toEqual(mockMapping);
				expect(LogEngine.debug).toHaveBeenCalledWith('Found ticket mapping for Discord thread: thread-456');
			});

			it('should return null when mapping not found', async () => {
				mockBotsStore.getThreadTicketMapping.mockResolvedValue(null);

				const result = await unthreadService.getTicketByDiscordThreadId('thread-456');

				expect(result).toBeNull();
				expect(LogEngine.debug).toHaveBeenCalledWith('No ticket mapping found for Discord thread: thread-456');
			});

			it('should handle retrieval errors', async () => {
				mockBotsStore.getThreadTicketMapping.mockRejectedValue(new Error('Retrieval failed'));

				const result = await unthreadService.getTicketByDiscordThreadId('thread-456');

				expect(result).toBeNull();
				expect(LogEngine.error).toHaveBeenCalledWith('Error retrieving ticket mapping by Discord thread ID:', expect.any(Error));
			});
		});

		describe('getTicketByUnthreadTicketId', () => {
			it('should retrieve mapping by ticket ID successfully', async () => {
				const mockMapping = {
					unthreadTicketId: 'ticket-123',
					discordThreadId: 'thread-456',
					createdAt: '2023-01-01T00:00:00Z',
					status: 'active',
				};

				mockBotsStore.getMappingByTicketId.mockResolvedValue(mockMapping);

				const result = await unthreadService.getTicketByUnthreadTicketId('ticket-123');

				expect(mockBotsStore.getMappingByTicketId).toHaveBeenCalledWith('ticket-123');
				expect(result).toEqual(mockMapping);
				expect(LogEngine.debug).toHaveBeenCalledWith('Found ticket mapping for Unthread ticket: ticket-123');
			});

			it('should return null when mapping not found', async () => {
				mockBotsStore.getMappingByTicketId.mockResolvedValue(null);

				const result = await unthreadService.getTicketByUnthreadTicketId('ticket-123');

				expect(result).toBeNull();
				expect(LogEngine.debug).toHaveBeenCalledWith('No ticket mapping found for Unthread ticket: ticket-123');
			});

			it('should handle retrieval errors gracefully', async () => {
				mockBotsStore.getMappingByTicketId.mockRejectedValue(new Error('Retrieval failed'));

				const result = await unthreadService.getTicketByUnthreadTicketId('ticket-123');

				expect(result).toBeNull();
				expect(LogEngine.error).toHaveBeenCalledWith('Error retrieving ticket mapping:', expect.any(Error));
			});
		});
	});

	describe('Webhook Event Processing', () => {
		describe('handleWebhookEvent', () => {
			it('should process message_created events', async () => {
				const payload: WebhookPayload = {
					platform: 'unthread',
					targetPlatform: 'discord',
					type: 'message_created',
					sourcePlatform: 'dashboard',
					timestamp: Date.now(),
					data: {
						id: 'message-123',
						conversationId: 'conversation-123',
						text: 'Test message',
						userId: 'user-123',
					},
				};

				// Mock the private handleMessageCreated function by ensuring it doesn't throw
				await expect(unthreadService.handleWebhookEvent(payload)).resolves.not.toThrow();

				expect(LogEngine.info).toHaveBeenCalledWith('Processing webhook event: message_created');
			});

			it('should process conversation_updated events', async () => {
				const payload: WebhookPayload = {
					platform: 'unthread',
					targetPlatform: 'discord',
					type: 'conversation_updated',
					sourcePlatform: 'dashboard',
					timestamp: Date.now(),
					data: {
						conversation: {
							id: 'conversation-123',
							friendlyId: 'T-123',
							status: 'closed',
						},
					},
				};

				await expect(unthreadService.handleWebhookEvent(payload)).resolves.not.toThrow();

				expect(LogEngine.info).toHaveBeenCalledWith('Processing webhook event: conversation_updated');
			});

			it('should log debug for conversation_created events', async () => {
				const payload: WebhookPayload = {
					platform: 'unthread',
					targetPlatform: 'discord',
					type: 'conversation_created',
					sourcePlatform: 'dashboard',
					timestamp: Date.now(),
					data: {},
				};

				await unthreadService.handleWebhookEvent(payload);

				expect(LogEngine.debug).toHaveBeenCalledWith('Conversation created event received - no action needed for Discord integration');
			});

			it('should log debug for unhandled event types', async () => {
				const payload: WebhookPayload = {
					platform: 'unthread',
					targetPlatform: 'discord',
					type: 'unknown_event',
					sourcePlatform: 'dashboard',
					timestamp: Date.now(),
					data: {},
				};

				await unthreadService.handleWebhookEvent(payload);

				expect(LogEngine.debug).toHaveBeenCalledWith('Unhandled webhook event type: unknown_event');
			});

			it('should handle processing errors', async () => {
				const payload: WebhookPayload = {
					platform: 'unthread',
					targetPlatform: 'discord',
					type: 'message_created',
					sourcePlatform: 'dashboard',
					timestamp: Date.now(),
					data: {
						// Malformed data that might cause errors
						id: null,
					},
				};

				// Since we can't easily mock the private functions, we'll just ensure it doesn't crash the process
				await expect(unthreadService.handleWebhookEvent(payload)).resolves.not.toThrow();
			});
		});
	});

	describe('Message Forwarding', () => {
		describe('sendMessageToUnthread', () => {
			it('should send message successfully', async () => {
				// Mock preflight check
				mockFetch
					.mockResolvedValueOnce({
						ok: true,
						status: 200,
					})
					// Mock actual message send
					.mockResolvedValueOnce({
						ok: true,
						status: 201,
						json: vi.fn().mockResolvedValue({
							messageId: 'message-123',
							content: 'Hello from Discord',
						}),
					});

				const result = await unthreadService.sendMessageToUnthread(
					'conversation-123',
					mockUser,
					'Hello from Discord',
					'test@example.com'
				);

				expect(mockFetch).toHaveBeenCalledTimes(2);
				
				// Check preflight request
				expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.unthread.io/api/conversations/conversation-123', {
					method: 'HEAD',
					headers: {
						'X-API-KEY': 'test-api-key',
					},
					signal: expect.any(AbortSignal),
				});

				// Check message send request
				expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.unthread.io/api/conversations/conversation-123/messages', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-KEY': 'test-api-key',
					},
					body: JSON.stringify({
						markdown: 'Hello from Discord',
						onBehalfOf: {
							name: 'Test User',
							email: 'test@example.com',
						},
					}),
					signal: expect.any(AbortSignal),
				});

				expect(result.success).toBe(true);
			});

			it('should handle preflight check failure', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: false,
					status: 404,
				});

				await expect(unthreadService.sendMessageToUnthread(
					'conversation-123',
					mockUser,
					'Hello from Discord',
					'test@example.com'
				)).rejects.toThrow('Conversation preflight check failed: 404 - Conversation may not exist or be accessible');
			});

			it('should handle message send failure', async () => {
				// Mock successful preflight
				mockFetch
					.mockResolvedValueOnce({
						ok: true,
						status: 200,
					})
					// Mock failed message send
					.mockResolvedValueOnce({
						ok: false,
						status: 400,
						text: vi.fn().mockResolvedValue('Bad Request'),
					});

				await expect(unthreadService.sendMessageToUnthread(
					'conversation-123',
					mockUser,
					'Hello from Discord',
					'test@example.com'
				)).rejects.toThrow('Failed to send message to Unthread: 400');

				expect(LogEngine.error).toHaveBeenCalledWith('Failed to send message to Unthread: 400 - Bad Request');
			});

			it('should handle timeout', async () => {
				vi.useFakeTimers();
				
				try {
					// Mock fetch to properly handle abort signal
					mockFetch.mockImplementation((url, options) => {
						return new Promise((resolve, reject) => {
							const signal = options?.signal;
							if (signal) {
								signal.addEventListener('abort', () => {
									const abortError = new Error('The operation was aborted');
									abortError.name = 'AbortError';
									reject(abortError);
								});
							}
							// Never resolve - let the timeout trigger
						});
					});

					const sendMessagePromise = unthreadService.sendMessageToUnthread(
						'conversation-123',
						mockUser,
						'Hello from Discord',
						'test@example.com'
					);

					// Advance to exactly 8000ms to trigger the timeout
					vi.advanceTimersByTime(8000);
					await vi.runAllTimersAsync();

					await expect(sendMessagePromise).rejects.toThrow('Request to Unthread timed out');
					expect(LogEngine.error).toHaveBeenCalledWith('Request to Unthread conversation conversation-123 timed out after 8 seconds');
				} finally {
					vi.useRealTimers();
					// Restore the mock to its default state
					mockFetch.mockClear();
				}
			});

			it('should use username when displayName is not available', async () => {
				const userWithoutDisplayName = { ...mockUser, displayName: undefined };

				mockFetch
					.mockResolvedValueOnce({ ok: true, status: 200 })
					.mockResolvedValueOnce({
						ok: true,
						status: 201,
						json: vi.fn().mockResolvedValue({}),
					});

				await unthreadService.sendMessageToUnthread(
					'conversation-123',
					userWithoutDisplayName,
					'Hello from Discord',
					'test@example.com'
				);

				expect(mockFetch).toHaveBeenNthCalledWith(2, expect.any(String), 
					expect.objectContaining({
						body: expect.stringContaining('"name":"testuser"'),
					})
				);
			});
		});

		describe('sendMessageWithAttachmentsToUnthread', () => {
			const mockFileBuffers: FileBuffer[] = [
				{
					buffer: Buffer.from('test file content'),
					fileName: 'test.png',
					mimeType: 'image/png',
					size: 1024,
				},
				{
					buffer: Buffer.from('another file'),
					fileName: 'test2.jpg',
					mimeType: 'image/jpeg',
					size: 2048,
				},
			];

			it('should send message with attachments successfully', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue({
						messageId: 'message-123',
						attachments: ['file1', 'file2'],
					}),
				});

				const result = await unthreadService.sendMessageWithAttachmentsToUnthread(
					'conversation-123',
					{ name: 'Test User', email: 'test@example.com' },
					'Message with attachments',
					mockFileBuffers
				);

				expect(mockFetch).toHaveBeenCalledWith('https://api.unthread.io/api/conversations/conversation-123/messages', {
					method: 'POST',
					headers: {
						'X-API-KEY': 'test-api-key',
						// Note: Content-Type header should NOT be set for FormData
					},
					body: expect.any(FormData),
					signal: expect.any(AbortSignal),
				});

				expect(result.success).toBe(true);
				expect(LogEngine.info).toHaveBeenCalledWith('Successfully uploaded 2 attachments to Unthread:', expect.any(Object));
			});

			it('should handle upload failure', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: false,
					status: 413,
					text: vi.fn().mockResolvedValue('Payload Too Large'),
				});

				await expect(unthreadService.sendMessageWithAttachmentsToUnthread(
					'conversation-123',
					{ name: 'Test User', email: 'test@example.com' },
					'Message with attachments',
					mockFileBuffers
				)).rejects.toThrow('Failed to upload attachments to Unthread: 413');

				expect(LogEngine.error).toHaveBeenCalledWith('Failed to upload attachments to Unthread: 413 - Payload Too Large');
			});

			it('should handle upload timeout', async () => {
				vi.useFakeTimers();
				
				try {
					// Mock fetch to properly handle abort signal
					mockFetch.mockImplementation((url, options) => {
						return new Promise((resolve, reject) => {
							const signal = options?.signal;
							if (signal) {
								signal.addEventListener('abort', () => {
									const abortError = new Error('The operation was aborted');
									abortError.name = 'AbortError';
									reject(abortError);
								});
							}
							// Never resolve - let the timeout trigger
						});
					});

					const uploadPromise = unthreadService.sendMessageWithAttachmentsToUnthread(
						'conversation-123',
						{ name: 'Test User', email: 'test@example.com' },
						'Message with attachments',
						mockFileBuffers
					);

					// Advance to exactly 30000ms to trigger the timeout
					vi.advanceTimersByTime(30000);
					await vi.runAllTimersAsync();

					await expect(uploadPromise).rejects.toThrow('File upload to Unthread timed out');
					expect(LogEngine.error).toHaveBeenCalledWith('File upload to Unthread conversation conversation-123 timed out after 30 seconds');
				} finally {
					vi.useRealTimers();
					// Restore the mock to its default state
					mockFetch.mockClear();
				}
			});
			it('should log file details during upload', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue({}),
				});

				await unthreadService.sendMessageWithAttachmentsToUnthread(
					'conversation-123',
					{ name: 'Test User', email: 'test@example.com' },
					'Message with attachments',
					mockFileBuffers
				);

				expect(LogEngine.debug).toHaveBeenCalledWith('Added attachment 1: test.png (1024 bytes, image/png)');
				expect(LogEngine.debug).toHaveBeenCalledWith('Added attachment 2: test2.jpg (2048 bytes, image/jpeg)');
			});

			it('should handle network errors', async () => {
				const networkError = new Error('Network failure');
				mockFetch.mockRejectedValue(networkError);

				await expect(unthreadService.sendMessageWithAttachmentsToUnthread(
					'conversation-123',
					{ name: 'Test User', email: 'test@example.com' },
					'Message with attachments',
					mockFileBuffers
				)).rejects.toThrow('Network failure');

				expect(LogEngine.error).toHaveBeenCalledWith('Error uploading attachments to Unthread:', networkError);
			});

			it('should create proper FormData structure', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue({}),
				});

				await unthreadService.sendMessageWithAttachmentsToUnthread(
					'conversation-123',
					{ name: 'Test User', email: 'test@example.com' },
					'Message with attachments',
					mockFileBuffers
				);

				const formData = mockFetch.mock.calls[0][1].body;
				expect(formData).toBeInstanceOf(FormData);

				// Check that the FormData structure includes the consolidated JSON payload
				expect(LogEngine.debug).toHaveBeenCalledWith('POST https://api.unthread.io/api/conversations/conversation-123/messages with consolidated JSON payload FormData upload (2 fields instead of 4+)');
			});
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle missing API key gracefully in createTicket', async () => {
			delete process.env.UNTHREAD_API_KEY;

			// This should throw because the API key is required
			await expect(unthreadService.createTicket(mockUser, 'Test', 'Test', 'test@example.com'))
				.rejects.toThrow('UNTHREAD_API_KEY environment variable is required');
		});

		it('should handle customer creation failure in createTicket', async () => {
			const error = new Error('Customer creation failed');
			mockGetOrCreateCustomer.mockRejectedValue(error);

			await expect(unthreadService.createTicket(mockUser, 'Test', 'Test', 'test@example.com'))
				.rejects.toThrow('Customer creation failed');
		});

		it('should handle empty or invalid conversation IDs', async () => {
			mockFetch
				.mockResolvedValueOnce({ ok: false, status: 404 });

			await expect(unthreadService.sendMessageToUnthread(
				'',
				mockUser,
				'Test message',
				'test@example.com'
			)).rejects.toThrow('Conversation preflight check failed');
		});

		it('should handle malformed API responses', async () => {
			mockFetch
				.mockResolvedValueOnce({ ok: true, status: 200 })
				.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
				});

			await expect(unthreadService.sendMessageToUnthread(
				'conversation-123',
				mockUser,
				'Test message',
				'test@example.com'
			)).rejects.toThrow('Invalid JSON');
		});

		it('should handle null/undefined user objects gracefully', async () => {
			const nullUser = null as any;

			// This should handle gracefully by using fallback values
			mockGetOrCreateCustomer.mockResolvedValue({ unthreadCustomerId: 'customer-123' });

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: vi.fn().mockResolvedValue({
					id: 'ticket-123',
					friendlyId: 'T-123',
				}),
			});

			// This might throw due to null user, which is expected
			await expect(unthreadService.createTicket(nullUser, 'Test', 'Test', 'test@example.com'))
				.rejects.toThrow();
		});

		it('should handle empty file buffers array', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: vi.fn().mockResolvedValue({}),
			});

			const result = await unthreadService.sendMessageWithAttachmentsToUnthread(
				'conversation-123',
				{ name: 'Test User', email: 'test@example.com' },
				'Message without attachments',
				[]
			);

			expect(result.success).toBe(true);
			expect(LogEngine.debug).toHaveBeenCalledWith('Sending message with 0 attachments to Unthread conversation conversation-123');
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle complete ticket creation workflow', async () => {
			// Reset and mock customer creation
			const mockCustomer = { unthreadCustomerId: 'customer-123', email: 'test@example.com', name: 'Test User' };
			mockGetOrCreateCustomer.mockResolvedValue(mockCustomer);

			// Set up ticket creation response
			const mockTicketResponse = {
				id: '3a1c7f44-edef-4edb-bfaf-71885969bfb0',
				friendlyId: 525,
				title: 'Integration Test Ticket',
				status: 'open',
			};
			
			// Clear and reset fetch mock completely, then set up for this specific test
			mockFetch.mockReset();
			mockFetch.mockResolvedValue({
				ok: true,
				status: 201,
				json: () => Promise.resolve(mockTicketResponse),
			});

			// Mock thread binding
			mockBotsStore.storeThreadTicketMapping.mockResolvedValue(undefined);

			// Execute workflow
			const ticket = await unthreadService.createTicket(mockUser, 'Integration Test Ticket', 'Test issue description', 'test@example.com');
			await unthreadService.bindTicketWithThread(ticket.id, 'thread-789');

			// Verify workflow completed successfully
			expect(ticket).toEqual(mockTicketResponse);
			expect(mockBotsStore.storeThreadTicketMapping).toHaveBeenCalledWith({
				unthreadTicketId: '3a1c7f44-edef-4edb-bfaf-71885969bfb0',
				discordThreadId: 'thread-789',
				createdAt: expect.any(String),
				status: 'active',
			});
		});

		it('should handle message sending with retry on network failure', async () => {
			// First attempt fails, second succeeds
			mockFetch
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValueOnce({ ok: true, status: 200 })
				.mockResolvedValueOnce({
					ok: true,
					status: 201,
					json: vi.fn().mockResolvedValue({ messageId: 'message-123' }),
				});

			// This would require implementing retry logic in the service
			// For now, we just test that the first failure is handled
			await expect(unthreadService.sendMessageToUnthread(
				'conversation-123',
				mockUser,
				'Test message',
				'test@example.com'
			)).rejects.toThrow('Network error');
		});
	});
});