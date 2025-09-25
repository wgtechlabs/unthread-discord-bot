/**
 * Test Suite: Version Command
 *
 * Comprehensive tests for the version command.
 * Tests cover command execution, embed creation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { execute, data } from '../../../commands/utilities/version';
import { getBotFooter } from '../../../utils/botUtils';

// Mock the getBotFooter utility
vi.mock('../../../utils/botUtils', () => ({
	getBotFooter: vi.fn(() => 'Unthread Bot v1.1.0 • Powered by Discord.js'),
}));

describe('version command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock interaction
		mockInteraction = {
			reply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('command data', () => {
		it('should have correct command name', () => {
			expect(data.name).toBe('version');
		});

		it('should have correct command description', () => {
			expect(data.description).toBe('Displays the current bot version.');
		});

		it('should be a valid SlashCommandBuilder instance', () => {
			expect(data).toBeDefined();
			expect(typeof data.toJSON).toBe('function');
		});
	});

	describe('execute function', () => {
		it('should reply with version embed', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledOnce();
			
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall).toHaveProperty('embeds');
			expect(replyCall).toHaveProperty('ephemeral', true);
			expect(replyCall.embeds).toHaveLength(1);
		});

		it('should create embed with correct properties', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('Bot Version');
			expect(embed.data.description).toMatch(/Current version: v\d+\.\d+\.\d+/);
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should use getBotFooter for consistent branding', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(getBotFooter).toHaveBeenCalledOnce();
			
			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];
			
			expect(embed.data.footer?.text).toBe('Unthread Bot v1.1.0 • Powered by Discord.js');
		});

		it('should include version from package.json', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Check that version is included and follows semantic versioning pattern
			expect(embed.data.description).toMatch(/v\d+\.\d+\.\d+/);
		});

		it('should reply as ephemeral message', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			expect(replyCall.ephemeral).toBe(true);
		});

		it('should handle interaction reply errors gracefully', async () => {
			const replyError = new Error('Reply failed');
			mockInteraction.reply = vi.fn().mockRejectedValue(replyError);

			await expect(execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Reply failed');
		});
	});

	describe('embed structure validation', () => {
		it('should create embed with all required fields', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Verify required embed properties
			expect(embed.data).toHaveProperty('color');
			expect(embed.data).toHaveProperty('title');
			expect(embed.data).toHaveProperty('description');
			expect(embed.data).toHaveProperty('footer');
			expect(embed.data).toHaveProperty('timestamp');
		});

		it('should use consistent color scheme', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
			const embed = replyCall.embeds[0];

			// Verify brand color (red: #EB1A1A)
			expect(embed.data.color).toBe(0xEB1A1A);
		});
	});
});