/**
 * @fileoverview Tests for Unthread Service
 * 
 * Comprehensive test suite for the Unthread API integration service covering
 * customer management, ticket operations, webhook processing, and message handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { User, EmbedBuilder } from 'discord.js';
import {
  validateEnvironment,
  saveCustomer,
  getCustomerById,
  createTicket,
  bindTicketWithThread,
  getTicketByDiscordThreadId,
  getTicketByUnthreadTicketId,
  handleWebhookEvent,
  sendMessageToUnthread,
  sendMessageWithAttachmentsToUnthread,
} from '../../services/unthread';
import { FileBuffer } from '../../types/attachments';
import { WebhookPayload } from '../../types/unthread';

// Mock dependencies
const mockBotsStore = {
  setBotData: vi.fn(),
  getBotData: vi.fn(),
  getBotConfig: vi.fn(),
  setBotConfig: vi.fn(),
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock user
const mockUser: User = {
  id: 'user123',
  username: 'testuser',
  discriminator: '1234',
  displayName: 'Test User',
  tag: 'testuser#1234',
  globalName: 'Test User',
  bot: false,
} as User;

// Helper to create mock response
const createMockResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: vi.fn().mockResolvedValue(data),
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
});

describe('Unthread Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up environment variables
    process.env.UNTHREAD_API_KEY = 'test-api-key';
    process.env.UNTHREAD_CUSTOMER_API_KEY = 'test-customer-api-key';
    
    // Mock BotsStore
    vi.doMock('../../sdk/bots-brain/BotsStore', () => ({
      BotsStore: {
        getInstance: () => mockBotsStore,
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateEnvironment', () => {
    it('should pass validation with all required environment variables', () => {
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should throw error when UNTHREAD_API_KEY is missing', () => {
      delete process.env.UNTHREAD_API_KEY;
      
      expect(() => validateEnvironment()).toThrow('UNTHREAD_API_KEY environment variable is required');
    });

    it('should throw error when UNTHREAD_CUSTOMER_API_KEY is missing', () => {
      delete process.env.UNTHREAD_CUSTOMER_API_KEY;
      
      expect(() => validateEnvironment()).toThrow('UNTHREAD_CUSTOMER_API_KEY environment variable is required');
    });
  });

  describe('saveCustomer', () => {
    it('should save customer successfully', async () => {
      const mockCustomer = {
        id: 'customer123',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockFetch.mockResolvedValue(createMockResponse(mockCustomer));

      const result = await saveCustomer(mockUser, 'test@example.com');

      expect(result).toEqual(mockCustomer);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/customers'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-customer-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('test@example.com'),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Invalid email' }, 400));

      await expect(saveCustomer(mockUser, 'invalid-email')).rejects.toThrow('Failed to save customer');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(saveCustomer(mockUser, 'test@example.com')).rejects.toThrow('Network error');
    });
  });

  describe('getCustomerById', () => {
    it('should retrieve customer by Discord ID', async () => {
      const mockCustomer = {
        id: 'customer123',
        discordId: 'user123',
        email: 'test@example.com',
      };

      mockFetch.mockResolvedValue(createMockResponse(mockCustomer));

      const result = await getCustomerById('user123');

      expect(result).toEqual(mockCustomer);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/customers/discord/user123'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-customer-api-key',
          }),
        })
      );
    });

    it('should return null for non-existent customer', async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, 404));

      const result = await getCustomerById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Server error' }, 500));

      await expect(getCustomerById('user123')).rejects.toThrow('Failed to get customer');
    });
  });

  describe('createTicket', () => {
    it('should create ticket successfully', async () => {
      const mockTicket = {
        id: 'ticket123',
        title: 'Test Issue',
        status: 'open',
        customerId: 'customer123',
      };

      // Mock customer lookup
      mockBotsStore.getBotData.mockResolvedValue('customer123');
      mockFetch.mockResolvedValue(createMockResponse(mockTicket));

      const result = await createTicket(mockUser, 'Test Issue', 'Test description', 'test@example.com');

      expect(result).toEqual(mockTicket);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should create customer if not found', async () => {
      mockBotsStore.getBotData.mockResolvedValue(null);
      
      // Mock customer creation
      const mockCustomer = { id: 'customer123' };
      const mockTicket = { id: 'ticket123', customerId: 'customer123' };
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockCustomer)) // Customer creation
        .mockResolvedValueOnce(createMockResponse(mockTicket)); // Ticket creation

      const result = await createTicket(mockUser, 'Test Issue', 'Test description', 'test@example.com');

      expect(result).toEqual(mockTicket);
      expect(mockBotsStore.setBotData).toHaveBeenCalledWith('customer:user123', 'customer123');
    });

    it('should handle ticket creation errors', async () => {
      mockBotsStore.getBotData.mockResolvedValue('customer123');
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Validation failed' }, 400));

      await expect(createTicket(mockUser, 'Test Issue', 'Test description', 'test@example.com'))
        .rejects.toThrow('Failed to create ticket');
    });
  });

  describe('bindTicketWithThread', () => {
    it('should bind ticket with thread successfully', async () => {
      await bindTicketWithThread('ticket123', 'thread456');

      expect(mockBotsStore.setBotData).toHaveBeenCalledWith(
        'ticket:thread456',
        expect.objectContaining({
          unthreadTicketId: 'ticket123',
          discordThreadId: 'thread456',
        })
      );
    });

    it('should handle binding errors', async () => {
      mockBotsStore.setBotData.mockRejectedValue(new Error('Database error'));

      await expect(bindTicketWithThread('ticket123', 'thread456'))
        .rejects.toThrow('Database error');
    });
  });

  describe('getTicketByDiscordThreadId', () => {
    it('should retrieve ticket mapping by thread ID', async () => {
      const mockMapping = {
        unthreadTicketId: 'ticket123',
        discordThreadId: 'thread456',
        createdAt: new Date(),
      };

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);

      const result = await getTicketByDiscordThreadId('thread456');

      expect(result).toEqual(mockMapping);
      expect(mockBotsStore.getBotData).toHaveBeenCalledWith('ticket:thread456');
    });

    it('should return null for non-existent mapping', async () => {
      mockBotsStore.getBotData.mockResolvedValue(null);

      const result = await getTicketByDiscordThreadId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getTicketByUnthreadTicketId', () => {
    it('should retrieve ticket mapping by Unthread ticket ID', async () => {
      const mockMapping = {
        unthreadTicketId: 'ticket123',
        discordThreadId: 'thread456',
        createdAt: new Date(),
      };

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);

      const result = await getTicketByUnthreadTicketId('ticket123');

      expect(result).toEqual(mockMapping);
      expect(mockBotsStore.getBotData).toHaveBeenCalledWith('ticket:reverse:ticket123');
    });

    it('should return null for non-existent reverse mapping', async () => {
      mockBotsStore.getBotData.mockResolvedValue(null);

      const result = await getTicketByUnthreadTicketId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('sendMessageToUnthread', () => {
    it('should send message successfully', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));

      const result = await sendMessageToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message'
      );

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/conversation123/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Unauthorized' }, 401));

      const result = await sendMessageToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message'
      );

      expect(result).toEqual({
        success: false,
        error: 'HTTP 401: Unauthorized',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await sendMessageToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message'
      );

      expect(result).toEqual({
        success: false,
        error: 'Network timeout',
      });
    });
  });

  describe('sendMessageWithAttachmentsToUnthread', () => {
    const mockFileBuffers: FileBuffer[] = [
      {
        buffer: Buffer.from('test content'),
        name: 'test.txt',
        contentType: 'text/plain',
      },
    ];

    it('should send message with attachments successfully', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));

      const result = await sendMessageWithAttachmentsToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Message with files',
        mockFileBuffers
      );

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/conversation123/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
          // Should be FormData for file uploads
          body: expect.any(FormData),
        })
      );
    });

    it('should handle file upload errors', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: 'File too large' }, 413));

      const result = await sendMessageWithAttachmentsToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Message with files',
        mockFileBuffers
      );

      expect(result).toEqual({
        success: false,
        error: 'HTTP 413: Payload Too Large',
      });
    });

    it('should handle empty attachments array', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));

      const result = await sendMessageWithAttachmentsToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Message without files',
        []
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('handleWebhookEvent', () => {
    const createMockWebhookPayload = (overrides: Partial<WebhookPayload> = {}): WebhookPayload => ({
      id: 'event123',
      type: 'conversation.message.created',
      data: {
        conversation: {
          id: 'conversation123',
          title: 'Test Conversation',
        },
        message: {
          id: 'message123',
          content: 'Test webhook message',
          sender: {
            name: 'Support Agent',
            email: 'agent@example.com',
          },
        },
      },
      ...overrides,
    } as WebhookPayload);

    it('should process webhook event successfully', async () => {
      const payload = createMockWebhookPayload();
      
      // Mock thread mapping lookup
      mockBotsStore.getBotData.mockResolvedValue({
        unthreadTicketId: 'ticket123',
        discordThreadId: 'thread456',
      });

      // Mock Discord client and thread
      const mockThread = {
        id: 'thread456',
        send: vi.fn().mockResolvedValue({}),
      };

      global.discordClient = {
        channels: {
          fetch: vi.fn().mockResolvedValue(mockThread),
        },
      };

      await handleWebhookEvent(payload);

      expect(mockBotsStore.getBotData).toHaveBeenCalledWith(
        expect.stringContaining('ticket:reverse:')
      );
    });

    it('should handle webhook for non-existent thread mapping', async () => {
      const payload = createMockWebhookPayload();
      mockBotsStore.getBotData.mockResolvedValue(null);

      // Should not throw error for missing mapping
      await expect(handleWebhookEvent(payload)).resolves.not.toThrow();
    });

    it('should handle invalid webhook payload', async () => {
      const invalidPayload = {} as WebhookPayload;

      // Should handle gracefully without throwing
      await expect(handleWebhookEvent(invalidPayload)).resolves.not.toThrow();
    });

    it('should handle Discord API errors', async () => {
      const payload = createMockWebhookPayload();
      
      mockBotsStore.getBotData.mockResolvedValue({
        unthreadTicketId: 'ticket123',
        discordThreadId: 'thread456',
      });

      global.discordClient = {
        channels: {
          fetch: vi.fn().mockRejectedValue(new Error('Discord API error')),
        },
      };

      // Should handle Discord errors gracefully
      await expect(handleWebhookEvent(payload)).resolves.not.toThrow();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(saveCustomer(mockUser, 'test@example.com'))
        .rejects.toThrow('Invalid JSON');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValue(createMockResponse(
        { error: 'Rate limited' },
        429
      ));

      await expect(saveCustomer(mockUser, 'test@example.com'))
        .rejects.toThrow('Failed to save customer');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      await expect(saveCustomer(mockUser, 'test@example.com'))
        .rejects.toThrow('Request timeout');
    });

    it('should validate required parameters', async () => {
      await expect(createTicket(mockUser, '', 'description', 'test@example.com'))
        .rejects.toThrow();
      
      await expect(createTicket(mockUser, 'title', '', 'test@example.com'))
        .rejects.toThrow();
    });

    it('should handle BotsStore errors gracefully', async () => {
      mockBotsStore.getBotData.mockRejectedValue(new Error('Storage error'));

      await expect(getTicketByDiscordThreadId('thread123'))
        .rejects.toThrow('Storage error');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete ticket creation flow', async () => {
      // Setup mocks for full flow
      mockBotsStore.getBotData.mockResolvedValue(null); // No existing customer
      
      const mockCustomer = { id: 'customer123' };
      const mockTicket = { id: 'ticket123', customerId: 'customer123' };
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockCustomer)) // Customer creation
        .mockResolvedValueOnce(createMockResponse(mockTicket)); // Ticket creation

      const result = await createTicket(mockUser, 'Integration Test', 'Full flow test', 'test@example.com');

      expect(result).toEqual(mockTicket);
      expect(mockBotsStore.setBotData).toHaveBeenCalledWith('customer:user123', 'customer123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle webhook to Discord message flow', async () => {
      const payload = createMockWebhookPayload({
        data: {
          conversation: { id: 'conv123' },
          message: {
            id: 'msg123',
            content: 'Response from support',
            sender: { name: 'Agent', email: 'agent@example.com' },
          },
        },
      });

      const mockThread = {
        id: 'thread456',
        send: vi.fn().mockResolvedValue({ id: 'discord_msg123' }),
      };

      mockBotsStore.getBotData.mockResolvedValue({
        unthreadTicketId: 'ticket123',
        discordThreadId: 'thread456',
      });

      global.discordClient = {
        channels: {
          fetch: vi.fn().mockResolvedValue(mockThread),
        },
      };

      await handleWebhookEvent(payload);

      expect(mockBotsStore.getBotData).toHaveBeenCalled();
      expect(global.discordClient.channels.fetch).toHaveBeenCalledWith('thread456');
    });
  });
});