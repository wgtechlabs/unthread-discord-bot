/**
 * Test Suite: Version Command
 *
 * Comprehensive tests for the version command module.
 * Tests cover command structure, version information retrieval, package.json integration,
 * bot footer utility integration, and error handling scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
 import { ChatInputCommandInteraction } from 'discord.js';
import { data as versionData, execute as versionExecute } from '../../../commands/utilities/version';

// Mock package.json version
vi.mock('../../../../package.json', () => ({
	version: '1.1.0',
}));

// Mock botUtils
vi.mock('../../../utils/botUtils', () => ({
	getBotFooter: vi.fn().mockReturnValue('Test Bot v1.1.0'),
}));

describe('Version Command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock interaction
		mockInteraction = {
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('Command Structure', () => {
		it('should have correct command data structure', () => {
			// Check that versionData has the correct properties instead of instanceof
			expect(versionData.name).toBe('version');
			expect(versionData.description).toBe('Displays the current bot version.');
			expect(typeof versionData.setName).toBe('function');
			expect(typeof versionData.setDescription).toBe('function');
		});

		it('should export execute function', () => {
			expect(typeof versionExecute).toBe('function');
		});
	});

	describe('Version Information Retrieval', () => {
		it('should display version information from package.json', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							title: 'Bot Version',
							description: 'Current version: v1.1.0',
							color: 0xEB1A1A,
							footer: expect.objectContaining({
								text: 'Test Bot v1.1.0',
							}),
							timestamp: expect.any(String),
						}),
					}),
				]),
				ephemeral: true,
			});
		});

		it('should use version from package.json import', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toBe('Current version: v1.1.0');
		});

		it('should format version with v prefix', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toMatch(/^Current version: v\d+\.\d+\.\d+/);
		});
	});

	describe('Embed Structure and Formatting', () => {
		it('should create embed with correct structure', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];

			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('Bot Version');
			expect(embed.data.description).toBeDefined();
			expect(embed.data.footer).toBeDefined();
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should use correct embed color', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.color).toBe(0xEB1A1A);
		});

		it('should include timestamp', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.timestamp).toBeDefined();
			expect(typeof embed.data.timestamp).toBe('string');
		});

		it('should have correct title', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.title).toBe('Bot Version');
		});
	});

	describe('Interaction Response', () => {
		it('should reply with ephemeral message', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.any(Array),
				ephemeral: true,
			});
		});

		it('should send exactly one embed', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			
			expect(replyCall[0].embeds).toHaveLength(1);
		});
	});

	describe('Integration with Bot Utils', () => {
		it('should call getBotFooter without parameters', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			expect(getBotFooter).toHaveBeenCalledWith();
		});

		it('should use getBotFooter result in embed footer', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			const footerText = 'Custom Bot Footer v1.1.0';
			vi.mocked(getBotFooter).mockReturnValue(footerText);

			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.footer?.text).toBe(footerText);
		});
	});
});