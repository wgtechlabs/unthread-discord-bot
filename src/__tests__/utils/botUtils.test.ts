/**
 * Test Suite: Bot Utilities
 *
 * Comprehensive tests for the botUtils module.
 * Tests cover bot name retrieval, footer generation, and various client states.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBotName, getBotFooter, getBotDisplayName } from '../../utils/botUtils';

describe('botUtils', () => {
	// Store original global state
	let originalGlobal: any;

	beforeEach(() => {
		// Store original global state
		originalGlobal = (global as any).discordClient;
	});

	afterEach(() => {
		// Restore original global state
		(global as any).discordClient = originalGlobal;
	});

	describe('getBotName', () => {
		it('should return display name when available', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'My Awesome Bot',
					username: 'unthread-bot',
				},
			};

			expect(getBotName()).toBe('My Awesome Bot');
		});

		it('should return username when display name is not available', () => {
			(global as any).discordClient = {
				user: {
					displayName: null,
					username: 'unthread-bot',
				},
			};

			expect(getBotName()).toBe('unthread-bot');
		});

		it('should return username when display name is undefined', () => {
			(global as any).discordClient = {
				user: {
					username: 'discord-helper',
				},
			};

			expect(getBotName()).toBe('discord-helper');
		});

		it('should return fallback when user is not available', () => {
			(global as any).discordClient = {
				user: null,
			};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when user is undefined', () => {
			(global as any).discordClient = {};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when client is not available', () => {
			(global as any).discordClient = null;

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when client is undefined', () => {
			(global as any).discordClient = undefined;

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should handle empty display name gracefully', () => {
			(global as any).discordClient = {
				user: {
					displayName: '',
					username: 'backup-name',
				},
			};

			expect(getBotName()).toBe('backup-name');
		});

		it('should handle empty username gracefully', () => {
			(global as any).discordClient = {
				user: {
					displayName: null,
					username: '',
				},
			};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should handle whitespace-only display name', () => {
			(global as any).discordClient = {
				user: {
					displayName: '   ',
					username: 'real-username',
				},
			};

			// Whitespace display name should be falsy, fall back to username
			expect(getBotName()).toBe('real-username');
		});
	});

	describe('getBotFooter', () => {
		it('should return formatted footer with display name and version', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Support Bot',
					username: 'support-bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe('Support Bot v1.1.0');
			expect(footer).toMatch(/^Support Bot v\d+\.\d+\.\d+/);
		});

		it('should return formatted footer with username when display name unavailable', () => {
			(global as any).discordClient = {
				user: {
					username: 'ticket-bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe('ticket-bot v1.1.0');
			expect(footer).toMatch(/^ticket-bot v\d+\.\d+\.\d+/);
		});

		it('should return formatted footer with fallback name when client unavailable', () => {
			(global as any).discordClient = null;

			const footer = getBotFooter();

			expect(footer).toBe('Unthread Discord Bot v1.1.0');
			expect(footer).toMatch(/^Unthread Discord Bot v\d+\.\d+\.\d+/);
		});

		it('should include version information', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Test Bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toContain('v');
			expect(footer).toMatch(/v\d+\.\d+\.\d+/);
		});

		it('should maintain consistent format', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Consistent Bot',
				},
			};

			const footer1 = getBotFooter();
			const footer2 = getBotFooter();

			expect(footer1).toBe(footer2);
			expect(footer1).toMatch(/^[\w\s]+ v\d+\.\d+\.\d+/);
		});

		it('should handle special characters in bot name', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Bot-With-Dashes & Symbols!',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe('Bot-With-Dashes & Symbols! v1.1.0');
			expect(footer).toContain('Bot-With-Dashes & Symbols!');
		});

		it('should handle Unicode characters in bot name', () => {
			(global as any).discordClient = {
				user: {
					displayName: '🤖 Unicode Bot 🚀',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe('🤖 Unicode Bot 🚀 v1.1.0');
			expect(footer).toContain('🤖');
			expect(footer).toContain('🚀');
		});
	});

	describe('getBotDisplayName', () => {
		it('should return the same as getBotName', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Display Name Test',
					username: 'username-test',
				},
			};

			const displayName = getBotDisplayName();
			const botName = getBotName();

			expect(displayName).toBe(botName);
			expect(displayName).toBe('Display Name Test');
		});

		// Test scenarios for consistency
		const testScenariosForConsistency = [
			{
				description: 'with display name',
				client: { user: { displayName: 'Test Display', username: 'test-user' } },
				expected: 'Test Display',
			},
			{
				description: 'with username only',
				client: { user: { username: 'only-username' } },
				expected: 'only-username',
			},
			{
				description: 'with no client',
				client: null,
				expected: 'Unthread Discord Bot',
			},
			{
				description: 'with empty user',
				client: { user: null },
				expected: 'Unthread Discord Bot',
			},
		];

		testScenariosForConsistency.forEach(({ description, client, expected }) => {
			it(`should handle ${description}`, () => {
				(global as any).discordClient = client;

				const displayName = getBotDisplayName();
				const botName = getBotName();

				expect(displayName).toBe(botName);
				expect(displayName).toBe(expected);
			});
		});

		it('should provide alias functionality for getBotName', () => {
			// Test that getBotDisplayName is effectively an alias
			(global as any).discordClient = {
				user: {
					displayName: 'Alias Test Bot',
				},
			};

			const displayName = getBotDisplayName();
			const botName = getBotName();

			expect(displayName).toBe(botName);
			expect(typeof getBotDisplayName).toBe('function');
			expect(typeof getBotName).toBe('function');
		});
	});

	describe('Integration and Consistency', () => {
		it('should maintain consistency across all functions', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Integration Test Bot',
					username: 'integration-bot',
				},
			};

			const botName = getBotName();
			const displayName = getBotDisplayName();
			const footer = getBotFooter();

			expect(displayName).toBe(botName);
			expect(footer).toContain(botName);
			expect(footer).toBe(`${botName} v1.1.0`);
		});

		it('should handle rapid client state changes', () => {
			// Test that functions work correctly when client state changes
			(global as any).discordClient = {
				user: {
					displayName: 'Initial Bot',
					username: 'initial-user',
				},
			};

			const initialName = getBotName();
			expect(initialName).toBe('Initial Bot');

			// Change client state
			(global as any).discordClient = {
				user: {
					username: 'changed-user',
				},
			};

			const changedName = getBotName();
			expect(changedName).toBe('changed-user');
			expect(changedName).not.toBe(initialName);
		});

		it('should work with minimal client object', () => {
			(global as any).discordClient = {
				user: {
					username: 'minimal-bot',
				},
			};

			const name = getBotName();
			const displayName = getBotDisplayName();
			const footer = getBotFooter();

			expect(name).toBe('minimal-bot');
			expect(displayName).toBe('minimal-bot');
			expect(footer).toBe('minimal-bot v1.1.0');
		});

		it('should handle undefined properties gracefully', () => {
			(global as any).discordClient = {
				user: {
					displayName: undefined,
					username: undefined,
				},
			};

			const name = getBotName();
			const displayName = getBotDisplayName();
			const footer = getBotFooter();

			expect(name).toBe('Unthread Discord Bot');
			expect(displayName).toBe('Unthread Discord Bot');
			expect(footer).toBe('Unthread Discord Bot v1.1.0');
		});
	});

	describe('Real-world Usage Scenarios', () => {
		it('should work in typical production environment', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Unthread Support Bot',
					username: 'unthread-support',
					id: '123456789012345678',
					avatar: 'avatar_hash_here',
					discriminator: '0000',
				},
			};

			const name = getBotName();
			const footer = getBotFooter();

			expect(name).toBe('Unthread Support Bot');
			expect(footer).toBe('Unthread Support Bot v1.1.0');
		});

		it('should work during bot initialization', () => {
			// Before client is ready
			(global as any).discordClient = null;

			expect(getBotName()).toBe('Unthread Discord Bot');
			expect(getBotFooter()).toBe('Unthread Discord Bot v1.1.0');

			// After client connects but user not yet set
			(global as any).discordClient = {};

			expect(getBotName()).toBe('Unthread Discord Bot');
			expect(getBotFooter()).toBe('Unthread Discord Bot v1.1.0');

			// After user becomes available
			(global as any).discordClient = {
				user: {
					username: 'newly-connected-bot',
				},
			};

			expect(getBotName()).toBe('newly-connected-bot');
			expect(getBotFooter()).toBe('newly-connected-bot v1.1.0');
		});

		it('should work in development environment', () => {
			(global as any).discordClient = {
				user: {
					displayName: 'Dev Bot [LOCAL]',
					username: 'dev-unthread-bot',
				},
			};

			const name = getBotName();
			const footer = getBotFooter();

			expect(name).toBe('Dev Bot [LOCAL]');
			expect(footer).toBe('Dev Bot [LOCAL] v1.1.0');
			expect(footer).toContain('[LOCAL]');
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should not throw when global is modified externally', () => {
			// Test resilience to external global modifications
			delete (global as any).discordClient;

			expect(() => getBotName()).not.toThrow();
			expect(() => getBotDisplayName()).not.toThrow();
			expect(() => getBotFooter()).not.toThrow();

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should handle frozen client objects', () => {
			const frozenClient = Object.freeze({
				user: Object.freeze({
					displayName: 'Frozen Bot',
					username: 'frozen-user',
				}),
			});

			(global as any).discordClient = frozenClient;

			expect(() => getBotName()).not.toThrow();
			expect(getBotName()).toBe('Frozen Bot');
		});

		it('should handle very long bot names', () => {
			const longName = 'A'.repeat(1000);

			(global as any).discordClient = {
				user: {
					displayName: longName,
				},
			};

			const name = getBotName();
			const footer = getBotFooter();

			expect(name).toBe(longName);
			expect(footer).toBe(`${longName} v1.1.0`);
			expect(footer.length).toBeGreaterThan(1000);
		});
	});
});