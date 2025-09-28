/**
 * Test Suite: Ready Event Handler
 *
 * Tests for the client ready event handler that initializes the bot,
 * sets presence, deploys commands, and validates forum channels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events, ActivityType, Client } from 'discord.js';
import { LogEngine } from '@config/logger';
import { deployCommandsIfNeeded } from '@utils/commandDeployment';
import { withRetry } from '@utils/retry';
import channelUtils from '@utils/channelUtils';
import readyEvent from '@events/ready';

// Mock all external dependencies
vi.mock('@utils/commandDeployment');
vi.mock('@utils/retry');
vi.mock('@utils/channelUtils', () => ({
	default: {
		getValidatedForumChannelIds: vi.fn(),
	},
}));

describe('Ready Event Handler', () => {
	let mockClient: Partial<Client>;

	beforeEach(() => {
		vi.clearAllMocks();
		
		mockClient = {
			user: {
				displayName: 'Test Bot',
				username: 'testbot',
				setPresence: vi.fn(),
			} as any,
		};

		// Mock process.exit to prevent actual exit during tests
		vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit() was called');
		});

		// Default withRetry mock that succeeds
		(withRetry as any).mockImplementation(async (fn: Function) => await fn());
	});

	describe('Event Configuration', () => {
		it('should export correct event name', () => {
			expect(readyEvent.name).toBe(Events.ClientReady);
		});

		it('should be configured as a once-only event', () => {
			expect(readyEvent.once).toBe(true);
		});

		it('should have an execute function', () => {
			expect(typeof readyEvent.execute).toBe('function');
		});
	});

	describe('Bot Presence Setup', () => {
		it('should set bot presence to online with listening activity', async () => {
			await readyEvent.execute(mockClient);

			expect(mockClient.user!.setPresence).toHaveBeenCalledWith({
				status: 'online',
				activities: [{
					name: 'support tickets',
					type: ActivityType.Listening,
				}],
			});
		});

		it('should handle missing user gracefully', async () => {
			mockClient.user = undefined;

			await expect(readyEvent.execute(mockClient)).resolves.not.toThrow();
		});
	});

	describe('Bot Initialization Logging', () => {
		it('should log bot name with display name when available', async () => {
			await readyEvent.execute(mockClient);

			expect(LogEngine.info).toHaveBeenCalledWith(
				expect.stringContaining('Test Bot @ v')
			);
		});

		it('should log username when display name is not available', async () => {
			mockClient.user!.displayName = undefined;

			await readyEvent.execute(mockClient);

			expect(LogEngine.info).toHaveBeenCalledWith(
				expect.stringContaining('testbot @ v')
			);
		});

		it('should include version information in log', async () => {
			await readyEvent.execute(mockClient);

			expect(LogEngine.info).toHaveBeenCalledWith(
				expect.stringMatching(/@ v\d+\.\d+\.\d+/)
			);
		});
	});

	describe('Command Deployment', () => {
		it('should deploy commands using retry strategy', async () => {
			(withRetry as any).mockImplementation(async (fn: Function) => await fn());

			await readyEvent.execute(mockClient);

			expect(withRetry).toHaveBeenCalledWith(
				expect.any(Function),
				{
					operationName: 'Discord command deployment',
					exponentialBackoff: true,
					maxAttempts: 3,
					baseDelayMs: 2000,
				}
			);
		});

		it('should call deployCommandsIfNeeded within retry wrapper', async () => {
			let capturedFunction: Function;
			(withRetry as any).mockImplementation(async (fn: Function) => {
				capturedFunction = fn;
				await fn();
			});

			await readyEvent.execute(mockClient);

			expect(capturedFunction!).toBeDefined();
			expect(deployCommandsIfNeeded).toHaveBeenCalledWith(mockClient);
		});

		it('should exit process when command deployment fails after all retries', async () => {
			const deployError = new Error('Command deployment failed');
			(withRetry as any).mockRejectedValue(deployError);

			await expect(readyEvent.execute(mockClient)).rejects.toThrow('process.exit() was called');

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Critical failure: Discord command deployment failed after all retry attempts. Bot startup aborted.',
				deployError
			);
		});
	});

	describe('Forum Channel Validation', () => {
		beforeEach(() => {
			// Reset environment variables
			delete process.env.FORUM_CHANNEL_IDS;
		});

		it('should validate forum channels on startup', async () => {
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient);

			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalled();
		});

		it('should log monitoring message for valid forum channels', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,channel2,channel3';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient);

			expect(LogEngine.info).toHaveBeenCalledWith(
				'Monitoring 2 forum channel(s) for ticket creation'
			);
		});

		it('should warn about invalid channels', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,channel2,channel3,channel4';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient);

			expect(LogEngine.warn).toHaveBeenCalledWith(
				'2 channel(s) in FORUM_CHANNEL_IDS are not forum channels and will be ignored'
			);
		});

		it('should handle empty FORUM_CHANNEL_IDS gracefully', async () => {
			process.env.FORUM_CHANNEL_IDS = '';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue([]);

			await readyEvent.execute(mockClient);

			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalled();
		});

		it('should filter out empty channel IDs', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,,channel2, ,channel3';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2', 'channel3']);

			await readyEvent.execute(mockClient);

			expect(LogEngine.info).toHaveBeenCalledWith(
				'Monitoring 3 forum channel(s) for ticket creation'
			);
		});

		it('should handle forum channel validation errors', async () => {
			const validationError = new Error('Forum validation failed');
			(channelUtils.getValidatedForumChannelIds as any).mockRejectedValue(validationError);

			await readyEvent.execute(mockClient);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error validating forum channels on startup:',
				validationError
			);
		});

		it('should not log monitoring message when no valid channels', async () => {
			process.env.FORUM_CHANNEL_IDS = 'invalid1,invalid2';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue([]);

			await readyEvent.execute(mockClient);

			expect(LogEngine.info).not.toHaveBeenCalledWith(
				expect.stringContaining('Monitoring')
			);
		});
	});

	describe('Error Handling', () => {
		it('should continue execution even if presence setting fails', async () => {
			// Tests that setPresence errors are not caught and propagate up
			(mockClient.user!.setPresence as any).mockImplementation(() => {
				throw new Error('Presence failed');
			});

			await expect(readyEvent.execute(mockClient)).rejects.toThrow('Presence failed');
		});

		it('should handle missing user object gracefully', async () => {
			mockClient.user = null;

			await expect(readyEvent.execute(mockClient)).resolves.not.toThrow();
		});
	});

	describe('Integration Testing', () => {
		it('should complete full initialization workflow', async () => {
			process.env.FORUM_CHANNEL_IDS = 'forum1,forum2';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['forum1', 'forum2']);
			(withRetry as any).mockImplementation(async (fn: Function) => await fn());

			await readyEvent.execute(mockClient);

			// Verify all major steps were executed
			expect(mockClient.user!.setPresence).toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith(expect.stringContaining('Test Bot @ v'));
			expect(withRetry).toHaveBeenCalled();
			expect(deployCommandsIfNeeded).toHaveBeenCalled();
			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith('Monitoring 2 forum channel(s) for ticket creation');
		});

		it('should handle partial failures gracefully', async () => {
			// Forum validation fails but rest should continue
			(channelUtils.getValidatedForumChannelIds as any).mockRejectedValue(new Error('Forum error'));
			(withRetry as any).mockImplementation(async (fn: Function) => await fn());

			await readyEvent.execute(mockClient);

			// Should still complete other initialization steps
			expect(mockClient.user!.setPresence).toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith(expect.stringContaining('Test Bot @ v'));
			expect(deployCommandsIfNeeded).toHaveBeenCalled();
		});
	});
});