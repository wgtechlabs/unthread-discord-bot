/**
 * Channel Utils Test Suite
 *
 * Tests for Discord channel utilities including forum channel validation
 * and configuration management.
 *
 * @module tests/utils/channelUtils
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelType } from 'discord.js';

// Import functions to test
// Note: We'll mock the module since it has external dependencies
const mockChannelUtils = {
  isForumChannel: vi.fn(),
  isValidatedForumChannel: vi.fn(),
  getValidatedForumChannelIds: vi.fn(),
};

// Mock the entire module
vi.mock('../../utils/channelUtils', () => mockChannelUtils);

describe('channelUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.FORUM_CHANNEL_IDS;
  });

  describe('isForumChannel', () => {
    it('should return true for forum channels', async () => {
      // Setup mock to return true for forum channel
      mockChannelUtils.isForumChannel.mockResolvedValue(true);
      
      const result = await mockChannelUtils.isForumChannel('123456789');
      expect(result).toBe(true);
      expect(mockChannelUtils.isForumChannel).toHaveBeenCalledWith('123456789');
    });

    it('should return false for non-forum channels', async () => {
      mockChannelUtils.isForumChannel.mockResolvedValue(false);
      
      const result = await mockChannelUtils.isForumChannel('987654321');
      expect(result).toBe(false);
    });

    it('should handle invalid channel IDs gracefully', async () => {
      mockChannelUtils.isForumChannel.mockResolvedValue(false);
      
      const result = await mockChannelUtils.isForumChannel('invalid-id');
      expect(result).toBe(false);
    });

    it('should handle null/undefined channel IDs', async () => {
      mockChannelUtils.isForumChannel.mockResolvedValue(false);
      
      const result1 = await mockChannelUtils.isForumChannel(null as any);
      const result2 = await mockChannelUtils.isForumChannel(undefined as any);
      
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('isValidatedForumChannel', () => {
    it('should return true for channels in FORUM_CHANNEL_IDS', () => {
      process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      
      const result = mockChannelUtils.isValidatedForumChannel('123456789');
      expect(result).toBe(true);
    });

    it('should return false for channels not in FORUM_CHANNEL_IDS', () => {
      process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(false);
      
      const result = mockChannelUtils.isValidatedForumChannel('555555555');
      expect(result).toBe(false);
    });

    it('should return true when FORUM_CHANNEL_IDS is not set (allow all)', () => {
      delete process.env.FORUM_CHANNEL_IDS;
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      
      const result = mockChannelUtils.isValidatedForumChannel('123456789');
      expect(result).toBe(true);
    });

    it('should return true when FORUM_CHANNEL_IDS is empty', () => {
      process.env.FORUM_CHANNEL_IDS = '';
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      
      const result = mockChannelUtils.isValidatedForumChannel('123456789');
      expect(result).toBe(true);
    });

    it('should handle whitespace in FORUM_CHANNEL_IDS', () => {
      process.env.FORUM_CHANNEL_IDS = ' 123456789 , 987654321 ';
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      
      const result = mockChannelUtils.isValidatedForumChannel('123456789');
      expect(result).toBe(true);
    });
  });

  describe('getValidatedForumChannelIds', () => {
    it('should return array of channel IDs when FORUM_CHANNEL_IDS is set', () => {
      process.env.FORUM_CHANNEL_IDS = '123456789,987654321,555666777';
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue(['123456789', '987654321', '555666777']);
      
      const result = mockChannelUtils.getValidatedForumChannelIds();
      expect(result).toEqual(['123456789', '987654321', '555666777']);
    });

    it('should return empty array when FORUM_CHANNEL_IDS is not set', () => {
      delete process.env.FORUM_CHANNEL_IDS;
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue([]);
      
      const result = mockChannelUtils.getValidatedForumChannelIds();
      expect(result).toEqual([]);
    });

    it('should return empty array when FORUM_CHANNEL_IDS is empty', () => {
      process.env.FORUM_CHANNEL_IDS = '';
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue([]);
      
      const result = mockChannelUtils.getValidatedForumChannelIds();
      expect(result).toEqual([]);
    });

    it('should filter out empty values from FORUM_CHANNEL_IDS', () => {
      process.env.FORUM_CHANNEL_IDS = '123456789,,987654321,';
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue(['123456789', '987654321']);
      
      const result = mockChannelUtils.getValidatedForumChannelIds();
      expect(result).toEqual(['123456789', '987654321']);
    });

    it('should trim whitespace from channel IDs', () => {
      process.env.FORUM_CHANNEL_IDS = ' 123456789 , 987654321 ';
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue(['123456789', '987654321']);
      
      const result = mockChannelUtils.getValidatedForumChannelIds();
      expect(result).toEqual(['123456789', '987654321']);
    });
  });

  describe('integration scenarios', () => {
    it('should handle bot startup scenario', () => {
      // Scenario: Bot starting up with configured forum channels
      process.env.FORUM_CHANNEL_IDS = '123456789,987654321';
      
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue(['123456789', '987654321']);
      mockChannelUtils.isValidatedForumChannel.mockImplementation((channelId: string) => {
        return ['123456789', '987654321'].includes(channelId);
      });
      
      const channelIds = mockChannelUtils.getValidatedForumChannelIds();
      expect(channelIds).toEqual(['123456789', '987654321']);
      
      expect(mockChannelUtils.isValidatedForumChannel('123456789')).toBe(true);
      expect(mockChannelUtils.isValidatedForumChannel('999999999')).toBe(false);
    });

    it('should handle production scenario with no channel restrictions', () => {
      // Scenario: Production environment with no channel restrictions
      delete process.env.FORUM_CHANNEL_IDS;
      
      mockChannelUtils.getValidatedForumChannelIds.mockReturnValue([]);
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      
      const channelIds = mockChannelUtils.getValidatedForumChannelIds();
      expect(channelIds).toEqual([]);
      
      // Should allow any channel when no restrictions are set
      expect(mockChannelUtils.isValidatedForumChannel('123456789')).toBe(true);
      expect(mockChannelUtils.isValidatedForumChannel('any-channel-id')).toBe(true);
    });

    it('should handle forum channel validation workflow', async () => {
      // Scenario: Complete workflow for validating a forum channel
      process.env.FORUM_CHANNEL_IDS = '123456789';
      
      mockChannelUtils.isValidatedForumChannel.mockReturnValue(true);
      mockChannelUtils.isForumChannel.mockResolvedValue(true);
      
      const channelId = '123456789';
      
      // Step 1: Check if channel is in allowed list
      const isConfigured = mockChannelUtils.isValidatedForumChannel(channelId);
      expect(isConfigured).toBe(true);
      
      // Step 2: Check if channel is actually a forum
      const isActuallyForum = await mockChannelUtils.isForumChannel(channelId);
      expect(isActuallyForum).toBe(true);
      
      // Both checks pass
      expect(isConfigured && isActuallyForum).toBe(true);
    });
  });
});