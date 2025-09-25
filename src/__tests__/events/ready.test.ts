/**
 * Test Suite: Ready Event Handler
 *
 * Comprehensive tests for the Discord.js ready event handler.
 * Tests cover bot initialization, presence setting, command deployment, and forum validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Events, ActivityType, Client } from 'discord.js';
import { LogEngine } from '../../config/logger';
import readyEvent from '../../events/ready';
import channelUtils from '../../utils/channelUtils';
import { deployCommandsIfNeeded } from '../../utils/commandDeployment';
import { withRetry } from '../../utils/retry';

// Mock external dependencies
vi.mock('../../utils/channelUtils', () => ({
	default: {
		getValidatedForumChannelIds: vi.fn(),
	},
}));

vi.mock('../../utils/commandDeployment', () => ({
	deployCommandsIfNeeded: vi.fn(),
}));

vi.mock('../../utils/retry', () => ({
	withRetry: vi.fn(),
}));

// Mock package.json
vi.mock('../../../package.json', () => ({
	version: '1.2.3',
}));

describe('ready event handler', () => {
	let mockClient: Partial<Client>;
	let mockUser: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Mock process.exit
		vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

		// Setup mock user
		mockUser = {
			displayName: 'Test Bot',
			username: 'testbot',
			setPresence: vi.fn().mockResolvedValue(undefined),
		};

		// Setup mock client
		mockClient = {
			user: mockUser,
		};

		// Setup default mock implementations
		(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);
		(deployCommandsIfNeeded as any).mockResolvedValue(undefined);
		(withRetry as any).mockImplementation(async (operation: () => Promise<any>) => {
			return await operation();
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.FORUM_CHANNEL_IDS;
	});

	describe('event configuration', () => {
		it('should have correct event name', () => {
			expect(readyEvent.name).toBe(Events.ClientReady);
		});

		it('should be a once-only event', () => {
			expect(readyEvent.once).toBe(true);
		});
	});

	describe('bot presence setup', () => {
		it('should set bot presence with correct activity', async () => {
			await readyEvent.execute(mockClient as Client);

			expect(mockUser.setPresence).toHaveBeenCalledOnce();
			expect(mockUser.setPresence).toHaveBeenCalledWith({
				status: 'online',
				activities: [{
					name: 'support tickets',
					type: ActivityType.Listening,
				}],
			});
		});

		it('should not throw if setPresence fails', async () => {
			mockUser.setPresence.mockRejectedValue(new Error('Presence failed'));

			await expect(readyEvent.execute(mockClient as Client)).resolves.not.toThrow();
		});

		it('should handle missing user object', async () => {
			mockClient.user = null;

			await expect(readyEvent.execute(mockClient as Client)).resolves.not.toThrow();
		});
	});

	describe('startup logging', () => {
		it('should log successful initialization with display name', async () => {
			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.info).toHaveBeenCalledWith('Logged in as Test Bot @ v1.2.3');
		});

		it('should fallback to username when display name is not available', async () => {
			mockUser.displayName = null;

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.info).toHaveBeenCalledWith('Logged in as testbot @ v1.2.3');
		});

		it('should handle missing user for logging', async () => {
			mockClient.user = null;

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.info).toHaveBeenCalledWith('Logged in as undefined @ v1.2.3');
		});
	});

	describe('command deployment', () => {
		it('should deploy commands with retry strategy', async () => {
			await readyEvent.execute(mockClient as Client);

			expect(withRetry).toHaveBeenCalledOnce();
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

		it('should call deployCommandsIfNeeded within retry', async () => {
			let operationFn: (() => Promise<void>) | undefined;
			(withRetry as any).mockImplementation(async (operation: () => Promise<void>) => {
				operationFn = operation;
				return await operation();
			});

			await readyEvent.execute(mockClient as Client);

			expect(operationFn).toBeDefined();
			expect(deployCommandsIfNeeded).toHaveBeenCalledWith(mockClient);
		});

		it('should exit process when command deployment fails', async () => {
			const deployError = new Error('Deployment failed');
			(withRetry as any).mockRejectedValue(deployError);

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Critical failure: Discord command deployment failed after all retry attempts. Bot startup aborted.',
				deployError
			);
			expect(process.exit).toHaveBeenCalledWith(1);
		});
	});

	describe('forum channel validation', () => {
		it('should validate forum channels when FORUM_CHANNEL_IDS is set', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,channel2,invalid_channel';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient as Client);

			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalledOnce();
			expect(LogEngine.warn).toHaveBeenCalledWith(
				'1 channel(s) in FORUM_CHANNEL_IDS are not forum channels and will be ignored'
			);
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Monitoring 2 forum channel(s) for ticket creation'
			);
		});

		it('should not warn when all channels are valid', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,channel2';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.warn).not.toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Monitoring 2 forum channel(s) for ticket creation'
			);
		});

		it('should handle no valid forum channels', async () => {
			process.env.FORUM_CHANNEL_IDS = 'invalid1,invalid2';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue([]);

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.warn).toHaveBeenCalledWith(
				'2 channel(s) in FORUM_CHANNEL_IDS are not forum channels and will be ignored'
			);
			expect(LogEngine.info).not.toHaveBeenCalledWith(
				expect.stringContaining('Monitoring')
			);
		});

		it('should skip validation when FORUM_CHANNEL_IDS is not set', async () => {
			delete process.env.FORUM_CHANNEL_IDS;

			await readyEvent.execute(mockClient as Client);

			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalledOnce();
			expect(LogEngine.warn).not.toHaveBeenCalled();
			expect(LogEngine.info).not.toHaveBeenCalledWith(
				expect.stringContaining('Monitoring')
			);
		});

		it('should handle forum validation errors', async () => {
			const validationError = new Error('Forum validation failed');
			(channelUtils.getValidatedForumChannelIds as any).mockRejectedValue(validationError);

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Error validating forum channels on startup:',
				validationError
			);
		});

		it('should handle empty FORUM_CHANNEL_IDS environment variable', async () => {
			process.env.FORUM_CHANNEL_IDS = '';

			await readyEvent.execute(mockClient as Client);

			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalledOnce();
			expect(LogEngine.warn).not.toHaveBeenCalled();
		});

		it('should handle whitespace-only channel IDs', async () => {
			process.env.FORUM_CHANNEL_IDS = ' , , ';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue([]);

			await readyEvent.execute(mockClient as Client);

			expect(LogEngine.warn).not.toHaveBeenCalled();
		});
	});

	describe('integration scenarios', () => {
		it('should complete full startup sequence successfully', async () => {
			process.env.FORUM_CHANNEL_IDS = 'channel1,channel2';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1', 'channel2']);

			await readyEvent.execute(mockClient as Client);

			// Verify all major components were called
			expect(mockUser.setPresence).toHaveBeenCalledOnce();
			expect(LogEngine.info).toHaveBeenCalledWith('Logged in as Test Bot @ v1.2.3');
			expect(withRetry).toHaveBeenCalledOnce();
			expect(deployCommandsIfNeeded).toHaveBeenCalledWith(mockClient);
			expect(channelUtils.getValidatedForumChannelIds).toHaveBeenCalledOnce();
			expect(LogEngine.info).toHaveBeenCalledWith('Monitoring 2 forum channel(s) for ticket creation');
		});

		it('should handle partial failures gracefully', async () => {
			// Presence fails but everything else succeeds
			mockUser.setPresence.mockRejectedValue(new Error('Presence failed'));
			process.env.FORUM_CHANNEL_IDS = 'channel1';
			(channelUtils.getValidatedForumChannelIds as any).mockResolvedValue(['channel1']);

			await readyEvent.execute(mockClient as Client);

			// Should still complete other operations
			expect(LogEngine.info).toHaveBeenCalledWith('Logged in as Test Bot @ v1.2.3');
			expect(deployCommandsIfNeeded).toHaveBeenCalledWith(mockClient);
			expect(LogEngine.info).toHaveBeenCalledWith('Monitoring 1 forum channel(s) for ticket creation');
		});
	});
});