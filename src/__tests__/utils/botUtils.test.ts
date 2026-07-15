/**
 * Test Suite: Bot Utilities
 *
 * Comprehensive tests for the botUtils module.
 * Tests cover bot name retrieval, footer generation, and various client states.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getBotDisplayName, getBotFooter, getBotName } from '../../utils/botUtils';
import { version } from '../../../package.json';

type DiscordClientMock = {
	user?: {
		displayName?: string | null;
		username?: string | null;
		[key: string]: unknown;
	} | null;
} | null;

type GlobalWithDiscordClient = typeof globalThis & {
	discordClient?: DiscordClientMock;
};

const globalWithDiscordClient = globalThis as GlobalWithDiscordClient;

describe('botUtils', () => {
	// Store original global state
	let originalGlobal: DiscordClientMock | undefined;

	beforeEach(() => {
		// Store original global state
		originalGlobal = globalWithDiscordClient.discordClient;
	});

	afterEach(() => {
		// Restore original global state
		globalWithDiscordClient.discordClient = originalGlobal;
	});

	describe('getBotName', () => {
		it('should return display name when available', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'My Awesome Bot',
					username: 'unthread-bot',
				},
			};

			expect(getBotName()).toBe('My Awesome Bot');
		});

		it('should return username when display name is not available', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: null,
					username: 'unthread-bot',
				},
			};

			expect(getBotName()).toBe('unthread-bot');
		});

		it('should return username when display name is undefined', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					username: 'discord-helper',
				},
			};

			expect(getBotName()).toBe('discord-helper');
		});

		it('should return fallback when user is not available', () => {
			globalWithDiscordClient.discordClient = {
				user: null,
			};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when user is undefined', () => {
			globalWithDiscordClient.discordClient = {};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when client is not available', () => {
			globalWithDiscordClient.discordClient = null;

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should return fallback when client is undefined', () => {
			globalWithDiscordClient.discordClient = undefined;

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should handle empty display name gracefully', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: '',
					username: 'backup-name',
				},
			};

			expect(getBotName()).toBe('backup-name');
		});

		it('should handle empty username gracefully', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: null,
					username: '',
				},
			};

			expect(getBotName()).toBe('Unthread Discord Bot');
		});

		it('should handle whitespace-only display name', () => {
			globalWithDiscordClient.discordClient = {
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
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'Support Bot',
					username: 'support-bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe(`Support Bot v${version}`);
			expect(footer).toMatch(/^Support Bot v\d+\.\d+\.\d+/);
		});

		it('should return formatted footer with username when display name unavailable', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					username: 'ticket-bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe(`ticket-bot v${version}`);
			expect(footer).toMatch(/^ticket-bot v\d+\.\d+\.\d+/);
		});

		it('should return formatted footer with fallback name when client unavailable', () => {
			globalWithDiscordClient.discordClient = null;

			const footer = getBotFooter();

			expect(footer).toBe(`Unthread Discord Bot v${version}`);
			expect(footer).toMatch(/^Unthread Discord Bot v\d+\.\d+\.\d+/);
		});

		it('should include version information', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'Test Bot',
				},
			};

			const footer = getBotFooter();

			expect(footer).toContain('v');
			expect(footer).toMatch(/v\d+\.\d+\.\d+/);
		});

		it('should maintain consistent format', () => {
			globalWithDiscordClient.discordClient = {
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
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'Bot-With-Dashes & Symbols!',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe(`Bot-With-Dashes & Symbols! v${version}`);
			expect(footer).toContain('Bot-With-Dashes & Symbols!');
		});

		it('should handle Unicode characters in bot name', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: '🤖 Unicode Bot 🚀',
				},
			};

			const footer = getBotFooter();

			expect(footer).toBe(`🤖 Unicode Bot 🚀 v${version}`);
			expect(footer).toContain('🤖');
			expect(footer).toContain('🚀');
		});
	});

	describe('getBotDisplayName', () => {
		it('should return the same as getBotName', () => {
			globalWithDiscordClient.discordClient = {
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

		for (const { description, client, expected } of testScenariosForConsistency) {
			it(`should handle ${description}`, () => {
				globalWithDiscordClient.discordClient = client;

				const displayName = getBotDisplayName();
				const botName = getBotName();

				expect(displayName).toBe(botName);
				expect(displayName).toBe(expected);
			});
		}

		it('should provide alias functionality for getBotName', () => {
			// Test that getBotDisplayName is effectively an alias
			globalWithDiscordClient.discordClient = {
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
			globalWithDiscordClient.discordClient = {
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
			expect(footer).toBe(`${botName} v${version}`);
		});

		it('should handle rapid client state changes', () => {
			// Test that functions work correctly when client state changes
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'Initial Bot',
					username: 'initial-user',
				},
			};

			const initialName = getBotName();
			expect(initialName).toBe('Initial Bot');

			// Change client state
			globalWithDiscordClient.discordClient = {
				user: {
					username: 'changed-user',
				},
			};

			const changedName = getBotName();
			expect(changedName).toBe('changed-user');
			expect(changedName).not.toBe(initialName);
		});

		it('should work with minimal client object', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					username: 'minimal-bot',
				},
			};

			const name = getBotName();
			const displayName = getBotDisplayName();
			const footer = getBotFooter();

			expect(name).toBe('minimal-bot');
			expect(displayName).toBe('minimal-bot');
			expect(footer).toBe(`minimal-bot v${version}`);
		});

		it('should handle undefined properties gracefully', () => {
			globalWithDiscordClient.discordClient = {
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
			expect(footer).toBe(`Unthread Discord Bot v${version}`);
		});
	});

	describe('Real-world Usage Scenarios', () => {
		it('should work in typical production environment', () => {
			globalWithDiscordClient.discordClient = {
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
			expect(footer).toBe(`Unthread Support Bot v${version}`);
		});

		it('should work during bot initialization', () => {
			// Before client is ready
			globalWithDiscordClient.discordClient = null;

			expect(getBotName()).toBe('Unthread Discord Bot');
			expect(getBotFooter()).toBe(`Unthread Discord Bot v${version}`);

			// After client connects but user not yet set
			globalWithDiscordClient.discordClient = {};

			expect(getBotName()).toBe('Unthread Discord Bot');
			expect(getBotFooter()).toBe(`Unthread Discord Bot v${version}`);

			// After user becomes available
			globalWithDiscordClient.discordClient = {
				user: {
					username: 'newly-connected-bot',
				},
			};

			expect(getBotName()).toBe('newly-connected-bot');
			expect(getBotFooter()).toBe(`newly-connected-bot v${version}`);
		});

		it('should work in development environment', () => {
			globalWithDiscordClient.discordClient = {
				user: {
					displayName: 'Dev Bot [LOCAL]',
					username: 'dev-unthread-bot',
				},
			};

			const name = getBotName();
			const footer = getBotFooter();

			expect(name).toBe('Dev Bot [LOCAL]');
			expect(footer).toBe(`Dev Bot [LOCAL] v${version}`);
			expect(footer).toContain('[LOCAL]');
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should not throw when global is modified externally', () => {
			// Test resilience to external global modifications
			globalWithDiscordClient.discordClient = undefined;

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

			globalWithDiscordClient.discordClient = frozenClient;

			expect(() => getBotName()).not.toThrow();
			expect(getBotName()).toBe('Frozen Bot');
		});

		it('should handle very long bot names', () => {
			const longName = 'A'.repeat(1000);

			globalWithDiscordClient.discordClient = {
				user: {
					displayName: longName,
				},
			};

			const name = getBotName();
			const footer = getBotFooter();

			expect(name).toBe(longName);
			expect(footer).toBe(`${longName} v${version}`);
			expect(footer.length).toBeGreaterThan(1000);
		});
	});
});
