/**
 * @fileoverview Tests for Unthread Service
 * 
 * Basic test suite for the Unthread API integration service covering
 * customer management, ticket operations, and message handling (without SDK dependencies).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock global fetch
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
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

describe('Unthread Service', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up environment variables
    process.env.UNTHREAD_API_KEY = 'test_api_key';
    process.env.UNTHREAD_API_BASE_URL = 'https://api.unthread.io';
  });

  describe('validateEnvironment', () => {
    it('should return true when all required environment variables are set', () => {
      const result = validateEnvironment();
      expect(result).toBe(true);
    });

    it('should return false when API key is missing', () => {
      delete process.env.UNTHREAD_API_KEY;
      const result = validateEnvironment();
      expect(result).toBe(false);
    });

    it('should return false when base URL is missing', () => {
      delete process.env.UNTHREAD_API_BASE_URL;
      const result = validateEnvironment();
      expect(result).toBe(false);
    });
  });

  describe('saveCustomer', () => {
    it('should save customer successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ 
        success: true,
        customerId: 'customer123' 
      }));

      const result = await saveCustomer({
        name: 'Test User',
        email: 'test@example.com',
        discordId: 'user123'
      });

      expect(result.success).toBe(true);
      expect(result.customerId).toBe('customer123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/customers'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_api_key',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Customer creation failed' },
        400
      ));

      const result = await saveCustomer({
        name: 'Test User',
        email: 'test@example.com',
        discordId: 'user123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Customer creation failed');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await saveCustomer({
        name: 'Test User',
        email: 'test@example.com',
        discordId: 'user123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getCustomerById', () => {
    it('should retrieve customer successfully', async () => {
      const customerData = {
        customerId: 'customer123',
        name: 'Test User',
        email: 'test@example.com',
        discordId: 'user123'
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(customerData));

      const result = await getCustomerById('customer123');

      expect(result).toEqual(customerData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/customers/customer123'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_api_key',
          }),
        })
      );
    });

    it('should handle customer not found', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(null, 404));

      const result = await getCustomerById('customer123');

      expect(result).toBeNull();
    });
  });

  describe('createTicket', () => {
    it('should create ticket successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        ticketId: 'ticket123'
      }));

      const result = await createTicket({
        customerId: 'customer123',
        title: 'Test Ticket',
        description: 'Test Description'
      });

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe('ticket123');
    });

    it('should handle ticket creation errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Ticket creation failed' },
        400
      ));

      const result = await createTicket({
        customerId: 'customer123',
        title: 'Test Ticket',
        description: 'Test Description'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticket creation failed');
    });
  });

  describe('sendMessageToUnthread', () => {
    it('should send message successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        messageId: 'message123'
      }));

      const result = await sendMessageToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message'
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('message123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/conversation123/messages'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should handle message send errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Message send failed' },
        400
      ));

      const result = await sendMessageToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message send failed');
    });
  });

  describe('sendMessageWithAttachmentsToUnthread', () => {
    it('should send message with attachments successfully', async () => {
      const fileBuffers: FileBuffer[] = [
        {
          buffer: Buffer.from('test file content'),
          filename: 'test.txt',
          contentType: 'text/plain'
        }
      ];

      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        messageId: 'message123'
      }));

      const result = await sendMessageWithAttachmentsToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message with attachments',
        fileBuffers
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('message123');
    });

    it('should handle attachment send errors', async () => {
      const fileBuffers: FileBuffer[] = [
        {
          buffer: Buffer.from('test file content'),
          filename: 'test.txt',
          contentType: 'text/plain'
        }
      ];

      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Attachment send failed' },
        400
      ));

      const result = await sendMessageWithAttachmentsToUnthread(
        'conversation123',
        { name: 'Test User', email: 'test@example.com' },
        'Test message with attachments',
        fileBuffers
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Attachment send failed');
    });
  });

  describe('handleWebhookEvent', () => {
    it('should handle webhook event successfully', async () => {
      const webhookPayload: WebhookPayload = {
        eventType: 'message.created',
        data: {
          messageId: 'message123',
          conversationId: 'conversation123',
          content: 'Test webhook message'
        }
      };

      const result = await handleWebhookEvent(webhookPayload);

      expect(result.success).toBe(true);
    });

    it('should handle unknown event types', async () => {
      const webhookPayload: WebhookPayload = {
        eventType: 'unknown.event' as any,
        data: {}
      };

      const result = await handleWebhookEvent(webhookPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown event type');
    });
  });

  describe('error handling', () => {
    it('should handle invalid input gracefully', async () => {
      const result = await saveCustomer(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle missing environment variables', async () => {
      delete process.env.UNTHREAD_API_KEY;

      const result = await saveCustomer({
        name: 'Test User',
        email: 'test@example.com',
        discordId: 'user123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required environment variables');
    });
  });
});