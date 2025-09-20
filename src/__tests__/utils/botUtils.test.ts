/**
 * Bot Utils Test Suite
 *
 * Tests for bot utility functions including name retrieval and footer generation.
 *
 * @module tests/utils/botUtils
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBotName, getBotFooter, getBotDisplayName } from '../../utils/botUtils';

describe('botUtils', () => {
  beforeEach(() => {
    // Clear global client before each test
    global.discordClient = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getBotName', () => {
    it('should return display name when available', () => {
      global.discordClient = {
        user: {
          displayName: 'My Cool Bot',
          username: 'coolbot',
        },
      } as any;

      expect(getBotName()).toBe('My Cool Bot');
    });

    it('should fallback to username when display name is not available', () => {
      global.discordClient = {
        user: {
          displayName: null,
          username: 'coolbot',
        },
      } as any;

      expect(getBotName()).toBe('coolbot');
    });

    it('should fallback to default name when client is not available', () => {
      global.discordClient = undefined;
      expect(getBotName()).toBe('Unthread Discord Bot');
    });

    it('should fallback to default name when user is not available', () => {
      global.discordClient = {
        user: null,
      } as any;

      expect(getBotName()).toBe('Unthread Discord Bot');
    });

    it('should handle empty display name and username', () => {
      global.discordClient = {
        user: {
          displayName: '',
          username: '',
        },
      } as any;

      expect(getBotName()).toBe('Unthread Discord Bot');
    });

    it('should handle undefined display name but valid username', () => {
      global.discordClient = {
        user: {
          displayName: undefined,
          username: 'testbot',
        },
      } as any;

      expect(getBotName()).toBe('testbot');
    });
  });

  describe('getBotFooter', () => {
    it('should return formatted footer with bot name and version', () => {
      global.discordClient = {
        user: {
          displayName: 'Test Bot',
          username: 'testbot',
        },
      } as any;

      const footer = getBotFooter();
      expect(footer).toMatch(/^Test Bot v\d+\.\d+\.\d+/);
    });

    it('should work with fallback bot name', () => {
      global.discordClient = undefined;
      
      const footer = getBotFooter();
      expect(footer).toMatch(/^Unthread Discord Bot v\d+\.\d+\.\d+/);
    });

    it('should include proper version format', () => {
      global.discordClient = {
        user: {
          displayName: 'Bot',
          username: 'bot',
        },
      } as any;

      const footer = getBotFooter();
      // Should match pattern: "Bot v1.0.0" or similar
      expect(footer).toMatch(/^Bot v\d+\.\d+\.\d+(-.*)?$/);
    });
  });

  describe('getBotDisplayName', () => {
    it('should return the same value as getBotName', () => {
      global.discordClient = {
        user: {
          displayName: 'Display Bot',
          username: 'displaybot',
        },
      } as any;

      expect(getBotDisplayName()).toBe(getBotName());
      expect(getBotDisplayName()).toBe('Display Bot');
    });

    it('should handle all the same edge cases as getBotName', () => {
      // Test with no client
      global.discordClient = undefined;
      expect(getBotDisplayName()).toBe('Unthread Discord Bot');

      // Test with username only
      global.discordClient = {
        user: {
          displayName: null,
          username: 'usernamebot',
        },
      } as any;
      expect(getBotDisplayName()).toBe('usernamebot');
    });
  });

  describe('integration tests', () => {
    it('should work together in realistic scenarios', () => {
      // Scenario: Bot is properly connected
      global.discordClient = {
        user: {
          displayName: 'Unthread Assistant',
          username: 'unthread-bot',
        },
      } as any;

      const name = getBotName();
      const displayName = getBotDisplayName();
      const footer = getBotFooter();

      expect(name).toBe('Unthread Assistant');
      expect(displayName).toBe('Unthread Assistant');
      expect(footer).toBe(`Unthread Assistant v1.0.0`);
    });

    it('should handle startup scenario where client is not ready', () => {
      // Scenario: Bot is starting up, client not ready yet
      global.discordClient = undefined;

      const name = getBotName();
      const displayName = getBotDisplayName();
      const footer = getBotFooter();

      expect(name).toBe('Unthread Discord Bot');
      expect(displayName).toBe('Unthread Discord Bot');
      expect(footer).toBe(`Unthread Discord Bot v1.0.0`);
    });

    it('should handle partial client data gracefully', () => {
      // Scenario: Client is partially initialized
      global.discordClient = {
        user: {
          displayName: undefined,
          username: 'partial-bot',
        },
      } as any;

      const name = getBotName();
      const footer = getBotFooter();

      expect(name).toBe('partial-bot');
      expect(footer).toBe(`partial-bot v1.0.0`);
    });
  });
});