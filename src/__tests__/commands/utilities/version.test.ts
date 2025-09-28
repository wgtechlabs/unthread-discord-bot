/**
 * Test Suite: Version Command
 *
 * Comprehensive tests for the version command module.
 * Tests cover command structure, version information retrieval, package.json integration,
 * bot footer utility integration, and error handling scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
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

	describe('Package.json Integration', () => {
		it('should import version from package.json', async () => {
			// This test verifies that the module correctly imports from package.json
			// The mock ensures we get the expected version
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toContain('1.1.0');
		});

		it('should handle different version formats', async () => {
			// Test with different version patterns
			const versions = ['1.0.0', '2.1.5', '10.0.0-beta', '3.2.1-alpha.1'];
			
			for (const version of versions) {
				// Re-mock the package.json for each version
				vi.doMock('../../../../package.json', () => ({
					version: version,
				}));

				// Re-import the command module to get the updated version
				const { execute } = await import('../../../commands/utilities/version');
				
				await execute(mockInteraction as ChatInputCommandInteraction);

				const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
				const embed = replyCall[0].embeds![0];
				
				expect(embed.data.description).toBe(`Current version: v${version}`);
				
				// Clear the mock call for the next iteration
				vi.mocked(mockInteraction.reply).mockClear();
			}
		});
	});

	describe('Bot Footer Integration', () => {
		it('should use getBotFooter utility for footer text', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			expect(getBotFooter).toHaveBeenCalled();

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.footer?.text).toBe('Test Bot v1.1.0');
		});

		it('should handle getBotFooter returning different values', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			
			const footerValues = [
				'Discord Bot v1.1.0',
				'Support Bot v1.1.0',
				'Unthread Bot v1.1.0',
			];

			for (const footerValue of footerValues) {
				vi.mocked(getBotFooter).mockReturnValue(footerValue);

				await versionExecute(mockInteraction as ChatInputCommandInteraction);

				const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
				const embed = replyCall[0].embeds![0];
				
				expect(embed.data.footer?.text).toBe(footerValue);
				
				// Clear the mock call for the next iteration
				vi.mocked(mockInteraction.reply).mockClear();
			}
		});

		it('should handle getBotFooter throwing error', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			vi.mocked(getBotFooter).mockImplementation(() => {
				throw new Error('Footer error');
			});

			// Should not throw, but may result in undefined footer
			await expect(versionExecute(mockInteraction as ChatInputCommandInteraction)).resolves.not.toThrow();
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

		it('should format description correctly', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toMatch(/^Current version: v\d+\.\d+\.\d+/);
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

		it('should be called exactly once', async () => {
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Scenarios', () => {
		it('should handle interaction reply failure', async () => {
			mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Reply failed'));

			await expect(versionExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Reply failed');
		});

		it('should handle missing interaction object properties', async () => {
			// Test with minimal interaction object
			const minimalInteraction = {
				reply: vi.fn().mockResolvedValue(undefined),
			};

			await versionExecute(minimalInteraction as ChatInputCommandInteraction);

			expect(minimalInteraction.reply).toHaveBeenCalled();
		});

		it('should handle getBotFooter returning undefined', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			vi.mocked(getBotFooter).mockReturnValue(undefined as any);

			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.footer?.text).toBeUndefined();
		});

		it('should handle getBotFooter returning empty string', async () => {
			const { getBotFooter } = await import('../../../utils/botUtils');
			vi.mocked(getBotFooter).mockReturnValue('');

			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.footer?.text).toBe('');
		});
	});

	describe('Version Display Accuracy', () => {
		it('should match package.json version exactly', async () => {
			// Verify that the displayed version matches the imported version
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			// Should contain the exact version from our mock
			expect(embed.data.description).toBe('Current version: v1.1.0');
		});

		it('should handle version with no patch number', async () => {
			vi.doMock('../../../../package.json', () => ({
				version: '2.0',
			}));

			const { execute } = await import('../../../commands/utilities/version');
			
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toBe('Current version: v2.0');
		});

		it('should handle version with additional metadata', async () => {
			vi.doMock('../../../../package.json', () => ({
				version: '1.2.3-beta.4+build.567',
			}));

			const { execute } = await import('../../../commands/utilities/version');
			
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toBe('Current version: v1.2.3-beta.4+build.567');
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

	describe('Command Usage Scenarios', () => {
		it('should work for debugging deployment versions', async () => {
			// Simulate production version check
			vi.doMock('../../../../package.json', () => ({
				version: '2.1.5',
			}));

			const { execute } = await import('../../../commands/utilities/version');
			
			await execute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			const embed = replyCall[0].embeds![0];
			
			expect(embed.data.description).toBe('Current version: v2.1.5');
			expect(replyCall[0].ephemeral).toBe(true);
		});

		it('should work for troubleshooting scenarios', async () => {
			// Version command should always be ephemeral for support scenarios
			await versionExecute(mockInteraction as ChatInputCommandInteraction);

			const replyCall = vi.mocked(mockInteraction.reply).mock.calls[0];
			
			expect(replyCall[0].ephemeral).toBe(true);
		});
	});
});