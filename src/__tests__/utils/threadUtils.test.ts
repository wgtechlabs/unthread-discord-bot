/**
 * @fileoverview Tests for ThreadUtils
 * 
 * Comprehensive test suite for Discord thread utilities covering thread-ticket
 * mapping operations, retry mechanisms, and BotsStore integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThreadChannel, Message, User } from 'discord.js';
import {
  MappingNotFoundError,
  findDiscordThreadByTicketIdWithRetry,
  findDiscordThreadByTicketId,
  fetchStarterMessage,
  ThreadTicketMapping,
} from '../../utils/threadUtils';

// Mock dependencies
const mockBotsStore = {
  getBotData: vi.fn(),
  setBotData: vi.fn(),
  getBotConfig: vi.fn(),
  setBotConfig: vi.fn(),
};

const mockDiscordClient = {
  channels: {
    fetch: vi.fn(),
  },
};

const mockLogEngine = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Setup global mocks
global.discordClient = mockDiscordClient;

vi.mock('../../sdk/bots-brain/BotsStore', () => ({
  BotsStore: {
    getInstance: vi.fn(() => mockBotsStore),
  },
}));

vi.mock('../../config/logger', () => ({
  LogEngine: mockLogEngine,
}));

// Create mock thread
const createMockThread = (overrides: Partial<ThreadChannel> = {}): ThreadChannel => ({
  id: 'thread123',
  name: 'Test Thread',
  type: 11, // GUILD_PUBLIC_THREAD
  parentId: 'channel123',
  ownerId: 'user123',
  archived: false,
  locked: false,
  messages: {
    fetch: vi.fn(),
  },
  ...overrides,
} as unknown as ThreadChannel);

// Create mock message
const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'message123',
  content: 'Test message content',
  author: {
    id: 'user123',
    bot: false,
  } as User,
  createdTimestamp: Date.now(),
  ...overrides,
} as unknown as Message);

// Create mock mapping
const createMockMapping = (overrides: Partial<ThreadTicketMapping> = {}): ThreadTicketMapping => ({
  unthreadTicketId: 'ticket123',
  discordThreadId: 'thread123',
  createdAt: new Date(),
  ...overrides,
});

describe('ThreadUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MappingNotFoundError', () => {
    it('should create error with correct properties', () => {
      const error = new MappingNotFoundError('Test mapping not found');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('MappingNotFoundError');
      expect(error.message).toBe('Test mapping not found');
    });

    it('should be distinguishable from generic errors', () => {
      const mappingError = new MappingNotFoundError('Not found');
      const genericError = new Error('Generic error');
      
      expect(mappingError instanceof MappingNotFoundError).toBe(true);
      expect(genericError instanceof MappingNotFoundError).toBe(false);
    });
  });

  describe('findDiscordThreadByTicketId', () => {
    it('should find thread by ticket ID successfully', async () => {
      const mockMapping = createMockMapping();
      const mockThread = createMockThread();

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

      const result = await findDiscordThreadByTicketId('ticket123');

      expect(result).toEqual({
        thread: mockThread,
        mapping: mockMapping,
      });

      expect(mockBotsStore.getBotData).toHaveBeenCalledWith('ticket:reverse:ticket123');
      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith('thread123');
    });

    it('should throw MappingNotFoundError when mapping does not exist', async () => {
      mockBotsStore.getBotData.mockResolvedValue(null);

      await expect(findDiscordThreadByTicketId('nonexistent'))
        .rejects.toThrow(MappingNotFoundError);
      
      await expect(findDiscordThreadByTicketId('nonexistent'))
        .rejects.toThrow('No thread mapping found for ticket ID: nonexistent');
    });

    it('should handle Discord API errors when fetching thread', async () => {
      const mockMapping = createMockMapping();
      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockRejectedValue(new Error('Thread not found'));

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Thread not found');

      expect(mockLogEngine.error).toHaveBeenCalledWith(
        'Failed to fetch Discord thread:',
        expect.any(Error)
      );
    });

    it('should handle BotsStore errors', async () => {
      mockBotsStore.getBotData.mockRejectedValue(new Error('Database connection failed'));

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Database connection failed');

      expect(mockLogEngine.error).toHaveBeenCalledWith(
        'Failed to get thread mapping from BotsStore:',
        expect.any(Error)
      );
    });

    it('should handle invalid mapping data', async () => {
      const invalidMapping = {
        unthreadTicketId: 'ticket123',
        // Missing discordThreadId
      };

      mockBotsStore.getBotData.mockResolvedValue(invalidMapping);

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Invalid mapping data: missing discordThreadId');
    });

    it('should handle null/undefined thread response from Discord', async () => {
      const mockMapping = createMockMapping();
      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(null);

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Thread not found or not accessible: thread123');
    });

    it('should validate ticket ID parameter', async () => {
      await expect(findDiscordThreadByTicketId(''))
        .rejects.toThrow('Ticket ID cannot be empty');

      await expect(findDiscordThreadByTicketId(null as any))
        .rejects.toThrow('Ticket ID must be a string');

      await expect(findDiscordThreadByTicketId(undefined as any))
        .rejects.toThrow('Ticket ID must be a string');
    });
  });

  describe('findDiscordThreadByTicketIdWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockMapping = createMockMapping();
      const mockThread = createMockThread();

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

      const result = await findDiscordThreadByTicketIdWithRetry('ticket123');

      expect(result).toEqual({
        thread: mockThread,
        mapping: mockMapping,
      });

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const mockMapping = createMockMapping();
      const mockThread = createMockThread();

      mockBotsStore.getBotData
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce(mockMapping);

      mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

      const result = await findDiscordThreadByTicketIdWithRetry('ticket123');

      expect(result).toEqual({
        thread: mockThread,
        mapping: mockMapping,
      });

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(3);
      expect(mockLogEngine.warn).toHaveBeenCalledTimes(2);
    });

    it('should not retry MappingNotFoundError', async () => {
      mockBotsStore.getBotData.mockResolvedValue(null);

      await expect(findDiscordThreadByTicketIdWithRetry('nonexistent'))
        .rejects.toThrow(MappingNotFoundError);

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(1);
      expect(mockLogEngine.warn).not.toHaveBeenCalled();
    });

    it('should fail after maximum retries', async () => {
      mockBotsStore.getBotData.mockRejectedValue(new Error('Persistent error'));

      await expect(findDiscordThreadByTicketIdWithRetry('ticket123'))
        .rejects.toThrow('Persistent error');

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(3); // Default max attempts
      expect(mockLogEngine.warn).toHaveBeenCalledTimes(2);
    });

    it('should use custom retry options', async () => {
      const customOptions = {
        maxAttempts: 5,
        baseDelay: 500,
        maxDelay: 2000,
      };

      mockBotsStore.getBotData.mockRejectedValue(new Error('Always fails'));

      await expect(findDiscordThreadByTicketIdWithRetry('ticket123', customOptions))
        .rejects.toThrow('Always fails');

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(5);
      expect(mockLogEngine.warn).toHaveBeenCalledTimes(4);
    });

    it('should handle Discord API errors with retry', async () => {
      const mockMapping = createMockMapping();

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch
        .mockRejectedValueOnce(new Error('Rate limited'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(createMockThread());

      const result = await findDiscordThreadByTicketIdWithRetry('ticket123');

      expect(result.thread).toBeDefined();
      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff delays', async () => {
      const startTime = Date.now();
      mockBotsStore.getBotData.mockRejectedValue(new Error('Always fails'));

      await expect(findDiscordThreadByTicketIdWithRetry('ticket123', {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
      })).rejects.toThrow();

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should have at least some delay between retries
      expect(totalTime).toBeGreaterThan(200); // 100ms + 200ms delays minimum
    });
  });

  describe('fetchStarterMessage', () => {
    it('should fetch starter message successfully', async () => {
      const mockThread = createMockThread();
      const mockStarterMessage = createMockMessage({
        id: 'starter123',
        content: 'This is the thread starter message',
      });

      mockThread.messages.fetch = vi.fn().mockResolvedValue(mockStarterMessage);

      const result = await fetchStarterMessage(mockThread);

      expect(result).toEqual(mockStarterMessage);
      expect(mockThread.messages.fetch).toHaveBeenCalledWith(mockThread.id);
    });

    it('should handle thread without starter message', async () => {
      const mockThread = createMockThread();
      mockThread.messages.fetch = vi.fn().mockResolvedValue(null);

      const result = await fetchStarterMessage(mockThread);

      expect(result).toBeNull();
      expect(mockLogEngine.debug).toHaveBeenCalledWith(
        `No starter message found for thread ${mockThread.id}`
      );
    });

    it('should handle Discord API errors', async () => {
      const mockThread = createMockThread();
      mockThread.messages.fetch = vi.fn().mockRejectedValue(new Error('Forbidden'));

      await expect(fetchStarterMessage(mockThread))
        .rejects.toThrow('Forbidden');

      expect(mockLogEngine.error).toHaveBeenCalledWith(
        'Failed to fetch starter message:',
        expect.any(Error)
      );
    });

    it('should validate thread parameter', async () => {
      await expect(fetchStarterMessage(null as any))
        .rejects.toThrow('Thread parameter is required');

      await expect(fetchStarterMessage(undefined as any))
        .rejects.toThrow('Thread parameter is required');
    });

    it('should handle malformed thread objects', async () => {
      const malformedThread = {
        id: 'thread123',
        // Missing messages property
      } as ThreadChannel;

      await expect(fetchStarterMessage(malformedThread))
        .rejects.toThrow('Thread object is missing required properties');
    });

    it('should handle archived threads', async () => {
      const archivedThread = createMockThread({
        archived: true,
      });

      archivedThread.messages.fetch = vi.fn().mockRejectedValue(
        new Error('Cannot access archived thread')
      );

      await expect(fetchStarterMessage(archivedThread))
        .rejects.toThrow('Cannot access archived thread');

      expect(mockLogEngine.error).toHaveBeenCalled();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle concurrent access to same ticket', async () => {
      const mockMapping = createMockMapping();
      const mockThread = createMockThread();

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

      // Simulate concurrent calls
      const promises = Array(5).fill(null).map(() => 
        findDiscordThreadByTicketId('ticket123')
      );

      const results = await Promise.all(promises);

      // All should succeed with same result
      results.forEach(result => {
        expect(result.thread).toEqual(mockThread);
        expect(result.mapping).toEqual(mockMapping);
      });

      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(5);
    });

    it('should handle very large ticket IDs', async () => {
      const largeTicketId = 'ticket_' + 'x'.repeat(1000);
      mockBotsStore.getBotData.mockResolvedValue(null);

      await expect(findDiscordThreadByTicketId(largeTicketId))
        .rejects.toThrow(MappingNotFoundError);

      expect(mockBotsStore.getBotData).toHaveBeenCalledWith(
        `ticket:reverse:${largeTicketId}`
      );
    });

    it('should handle special characters in ticket IDs', async () => {
      const specialTicketId = 'ticket-123_abc@domain.com';
      const mockMapping = createMockMapping({
        unthreadTicketId: specialTicketId,
      });
      const mockThread = createMockThread();

      mockBotsStore.getBotData.mockResolvedValue(mockMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(mockThread);

      const result = await findDiscordThreadByTicketId(specialTicketId);

      expect(result.mapping.unthreadTicketId).toBe(specialTicketId);
    });

    it('should handle memory pressure during operations', async () => {
      // Simulate memory pressure by creating large objects
      const largeMapping = createMockMapping();
      (largeMapping as any).largeData = Buffer.alloc(10 * 1024 * 1024); // 10MB

      mockBotsStore.getBotData.mockResolvedValue(largeMapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(createMockThread());

      const result = await findDiscordThreadByTicketId('ticket123');
      
      expect(result).toBeDefined();
      expect(result.mapping).toEqual(largeMapping);
    });

    it('should handle malformed mapping data from storage', async () => {
      const malformedMapping = {
        // Missing required fields
        someOtherField: 'value',
      };

      mockBotsStore.getBotData.mockResolvedValue(malformedMapping);

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Invalid mapping data');
    });

    it('should handle Discord client not being available', async () => {
      global.discordClient = null;

      await expect(findDiscordThreadByTicketId('ticket123'))
        .rejects.toThrow('Discord client not available');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete thread lookup workflow', async () => {
      // Simulate realistic scenario
      const ticketId = 'support-ticket-12345';
      const threadId = 'discord-thread-67890';
      
      const mapping = createMockMapping({
        unthreadTicketId: ticketId,
        discordThreadId: threadId,
        createdAt: new Date('2024-01-01'),
      });
      
      const thread = createMockThread({
        id: threadId,
        name: 'Support: Login Issues',
        parentId: 'support-channel-123',
      });

      mockBotsStore.getBotData.mockResolvedValue(mapping);
      mockDiscordClient.channels.fetch.mockResolvedValue(thread);

      const result = await findDiscordThreadByTicketId(ticketId);

      expect(result).toEqual({
        thread,
        mapping,
      });

      // Verify the complete flow
      expect(mockBotsStore.getBotData).toHaveBeenCalledWith(`ticket:reverse:${ticketId}`);
      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(threadId);
      expect(mockLogEngine.info).toHaveBeenCalledWith(
        `Successfully found thread ${threadId} for ticket ${ticketId}`
      );
    });

    it('should handle retry scenario with eventual success', async () => {
      const ticketId = 'flaky-ticket-123';
      const mapping = createMockMapping({ unthreadTicketId: ticketId });
      const thread = createMockThread();

      // Simulate network instability
      mockBotsStore.getBotData
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Service temporarily unavailable'))
        .mockResolvedValueOnce(mapping);

      mockDiscordClient.channels.fetch.mockResolvedValue(thread);

      const result = await findDiscordThreadByTicketIdWithRetry(ticketId);

      expect(result.thread).toEqual(thread);
      expect(result.mapping).toEqual(mapping);

      // Verify retry behavior
      expect(mockBotsStore.getBotData).toHaveBeenCalledTimes(3);
      expect(mockLogEngine.warn).toHaveBeenCalledTimes(2);
      expect(mockLogEngine.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully found thread')
      );
    });

    it('should handle starter message retrieval workflow', async () => {
      const thread = createMockThread({
        id: 'thread123',
        name: 'Customer Support Thread',
      });

      const starterMessage = createMockMessage({
        id: 'thread123', // Same as thread ID for starter message
        content: 'Hello, I need help with my account',
        author: {
          id: 'user456',
          bot: false,
        } as User,
      });

      thread.messages.fetch = vi.fn().mockResolvedValue(starterMessage);

      const result = await fetchStarterMessage(thread);

      expect(result).toEqual(starterMessage);
      expect(thread.messages.fetch).toHaveBeenCalledWith('thread123');
      expect(mockLogEngine.debug).toHaveBeenCalledWith(
        'Fetching starter message for thread thread123'
      );
    });
  });
});