/**
 * Test Suite: Command Deployment Utilities
 *
 * Comprehensive tests for the command deployment utility module.
 * Tests cover smart command deployment, comparison logic, and Discord API integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deployCommandsIfNeeded } from '@utils/commandDeployment';
import { LogEngine } from '@wgtechlabs/log-engine';
import { REST, Routes, Client } from 'discord.js';

// Mock Discord.js modules
vi.mock('discord.js', () => ({
	REST: vi.fn(),
	Routes: {
		applicationGuildCommands: vi.fn(),
	},
}));

describe('commandDeployment', () => {
	let mockRest: any;
	let mockClient: any;

	beforeEach(() => {
		// Create spies for LogEngine methods to enable assertions
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Set up environment variables
		process.env.DISCORD_BOT_TOKEN = 'test_bot_token';
		process.env.CLIENT_ID = 'test_client_id';
		process.env.GUILD_ID = 'test_guild_id';

		// Create mock REST instance
		mockRest = {
			setToken: vi.fn().mockReturnThis(),
			get: vi.fn(),
			put: vi.fn(),
		};

		// Mock REST constructor
		(REST as any).mockImplementation(() => mockRest);

		// Mock Routes.applicationGuildCommands
		(Routes.applicationGuildCommands as any).mockReturnValue('application-guild-commands-route');

		// Create mock client with commands collection
		mockClient = {
			commands: new Map(),
		};
	});

	afterEach(() => {
		// Restore all mocks and spies
		vi.restoreAllMocks();
		// Clear all mock call history
		vi.clearAllMocks();
		// Reset environment variables
		delete process.env.DISCORD_BOT_TOKEN;
		delete process.env.CLIENT_ID;
		delete process.env.GUILD_ID;
	});

	describe('deployCommandsIfNeeded', () => {
		it('should skip deployment when required environment variables are missing', async () => {
			delete process.env.DISCORD_BOT_TOKEN;

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith(
				'Skipping command deployment: Missing required environment variables (DISCORD_BOT_TOKEN, CLIENT_ID, or GUILD_ID)'
			);
			expect(mockRest.setToken).not.toHaveBeenCalled();
		});

		it('should skip deployment when CLIENT_ID is missing', async () => {
			delete process.env.CLIENT_ID;

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith(
				'Skipping command deployment: Missing required environment variables (DISCORD_BOT_TOKEN, CLIENT_ID, or GUILD_ID)'
			);
		});

		it('should skip deployment when GUILD_ID is missing', async () => {
			delete process.env.GUILD_ID;

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith(
				'Skipping command deployment: Missing required environment variables (DISCORD_BOT_TOKEN, CLIENT_ID, or GUILD_ID)'
			);
		});

		it('should skip deployment when client has no commands collection', async () => {
			const clientWithoutCommands = {} as Client;

			const result = await deployCommandsIfNeeded(clientWithoutCommands);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('No commands collection found on client');
		});

		it('should skip deployment when no local commands are found', async () => {
			// Empty commands collection
			mockClient.commands = new Map();

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('No local commands found to deploy');
		});

		it('should deploy commands when new commands are added', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
						options: [],
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing commands (empty)
			mockRest.get.mockResolvedValue([]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'test-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(mockRest.setToken).toHaveBeenCalledWith('test_bot_token');
			expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('test_client_id', 'test_guild_id');
			expect(mockRest.get).toHaveBeenCalledWith('application-guild-commands-route');
			expect(mockRest.put).toHaveBeenCalledWith('application-guild-commands-route', {
				body: [{ name: 'test-command', description: 'A test command', options: [] }],
			});
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 added (test-command)');
			expect(LogEngine.info).toHaveBeenCalledWith('Successfully deployed 1 slash commands to Discord API');
		});

		it('should deploy commands when existing commands are modified', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'Updated test command',
						options: [],
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing commands with different description
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123',
					application_id: 'app_123',
					version: '1',
					name: 'test-command',
					description: 'Original test command',
					options: [],
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'test-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 modified (test-command)');
		});

		it('should deploy commands when some existing commands are removed', async () => {
			// Set up local commands (one remaining command)
			const remainingCommand = {
				data: {
					toJSON: () => ({
						name: 'remaining-command',
						description: 'A command that remains',
					}),
				},
			};
			mockClient.commands.set('remaining-command', remainingCommand);

			// Mock existing commands with one that will be removed
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_1',
					name: 'remaining-command',
					description: 'A command that remains',
				},
				{
					id: 'cmd_2',
					name: 'removed-command',
					description: 'Command to be removed',
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'remaining-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 removed (removed-command)');
		});

		it('should skip deployment when commands are unchanged', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
						options: [],
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing commands that are identical (ignoring Discord metadata)
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123',
					application_id: 'app_123',
					version: '1',
					name: 'test-command',
					description: 'A test command',
					options: [],
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(mockRest.put).not.toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith('Commands are up-to-date (1 commands unchanged) - skipping deployment');
		});

		it('should handle multiple types of changes simultaneously', async () => {
			// Set up local commands
			const modifiedCommand = {
				data: {
					toJSON: () => ({
						name: 'modified-command',
						description: 'Updated description',
						options: [],
					}),
				},
			};
			const newCommand = {
				data: {
					toJSON: () => ({
						name: 'new-command',
						description: 'A new command',
						options: [],
					}),
				},
			};
			const unchangedCommand = {
				data: {
					toJSON: () => ({
						name: 'unchanged-command',
						description: 'Same description',
						options: [],
					}),
				},
			};

			mockClient.commands.set('modified-command', modifiedCommand);
			mockClient.commands.set('new-command', newCommand);
			mockClient.commands.set('unchanged-command', unchangedCommand);

			// Mock existing commands
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_1',
					name: 'modified-command',
					description: 'Original description',
					options: [],
				},
				{
					id: 'cmd_2',
					name: 'removed-command',
					description: 'Command to be removed',
					options: [],
				},
				{
					id: 'cmd_3',
					name: 'unchanged-command',
					description: 'Same description',
					options: [],
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([
				{ name: 'modified-command' },
				{ name: 'new-command' },
				{ name: 'unchanged-command' },
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Command changes detected: 1 added (new-command), 1 modified (modified-command), 1 removed (removed-command)'
			);
		});

		it('should preserve functional configuration fields during comparison', async () => {
			// Set up local commands with functional fields
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
						default_member_permissions: '8', // Administrator permission
						dm_permission: false,
						options: [],
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing commands with different functional fields
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123',
					application_id: 'app_123',
					version: '1',
					name: 'test-command',
					description: 'A test command',
					default_member_permissions: null, // Different permission
					dm_permission: true, // Different DM permission
					options: [],
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'test-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 modified (test-command)');
		});

		it('should handle commands with complex options', async () => {
			// Set up local commands with options
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'complex-command',
						description: 'A command with options',
						options: [
							{
								name: 'option1',
								description: 'First option',
								type: 3, // STRING
								required: true,
							},
							{
								name: 'option2',
								description: 'Second option',
								type: 4, // INTEGER
								required: false,
							},
						],
					}),
				},
			};
			mockClient.commands.set('complex-command', mockCommand);

			// Mock existing commands with different options
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123',
					name: 'complex-command',
					description: 'A command with options',
					options: [
						{
							name: 'option1',
							description: 'First option',
							type: 3,
							required: false, // Different required value
						},
					],
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'complex-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 modified (complex-command)');
		});

		it('should handle Discord API errors gracefully', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock API error when fetching existing commands
			const apiError = new Error('Discord API error');
			mockRest.get.mockRejectedValue(apiError);

			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow('Discord API error');

			expect(LogEngine.error).toHaveBeenCalledWith('Failed to deploy commands to Discord:', apiError);
		});

		it('should handle deployment API errors gracefully', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock successful fetch but failed deployment
			mockRest.get.mockResolvedValue([]);
			const deployError = new Error('Deployment failed');
			mockRest.put.mockRejectedValue(deployError);

			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow('Deployment failed');

			expect(LogEngine.error).toHaveBeenCalledWith('Failed to deploy commands to Discord:', deployError);
		});

		it('should handle rate limiting errors', async () => {
			// Set up local commands
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock rate limiting error
			const rateLimitError = new Error('Too many requests');
			rateLimitError.name = 'DiscordAPIError';
			mockRest.get.mockRejectedValue(rateLimitError);

			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow('Too many requests');

			expect(LogEngine.error).toHaveBeenCalledWith('Failed to deploy commands to Discord:', rateLimitError);
		});

		it('should handle malformed command data gracefully', async () => {
			// Set up command with malformed data that returns valid structure but with missing fields
			const malformedCommand = {
				data: {
					toJSON: () => ({
						// Missing required 'name' field
						description: 'A command without a name',
					}),
				},
			};
			mockClient.commands.set('malformed-command', malformedCommand);

			// Mock empty existing commands
			mockRest.get.mockResolvedValue([]);

			// This should cause an error when trying to access the name property
			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow();

			expect(LogEngine.error).toHaveBeenCalledWith(
				'Failed to deploy commands to Discord:',
				expect.any(Error)
			);
		});

		it('should preserve command order from original array', async () => {
			// Set up multiple local commands
			const command1 = {
				data: {
					toJSON: () => ({
						name: 'command-1',
						description: 'First command',
					}),
				},
			};
			const command2 = {
				data: {
					toJSON: () => ({
						name: 'command-2',
						description: 'Second command',
					}),
				},
			};

			mockClient.commands.set('command-1', command1);
			mockClient.commands.set('command-2', command2);

			// Mock empty existing commands
			mockRest.get.mockResolvedValue([]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'command-1' }, { name: 'command-2' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(mockRest.put).toHaveBeenCalledWith('application-guild-commands-route', {
				body: [
					{ name: 'command-1', description: 'First command' },
					{ name: 'command-2', description: 'Second command' },
				],
			});
		});
	});

	describe('Command Normalization', () => {
		it('should ignore Discord metadata fields during comparison', async () => {
			// Set up local command
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing command with Discord metadata
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123456789',
					application_id: 'app_987654321',
					version: '1234567890',
					name: 'test-command',
					description: 'A test command',
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			// Should skip deployment because content is the same
			expect(result).toBe(false);
			expect(LogEngine.info).toHaveBeenCalledWith('Commands are up-to-date (1 commands unchanged) - skipping deployment');
		});

		it('should detect changes in functional fields', async () => {
			// Set up local command
			const mockCommand = {
				data: {
					toJSON: () => ({
						name: 'test-command',
						description: 'A test command',
						dm_permission: true,
					}),
				},
			};
			mockClient.commands.set('test-command', mockCommand);

			// Mock existing command with different functional field
			mockRest.get.mockResolvedValue([
				{
					id: 'cmd_123',
					application_id: 'app_123',
					version: '1',
					name: 'test-command',
					description: 'A test command',
					dm_permission: false, // Different value
				},
			]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue([{ name: 'test-command' }]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			// Should deploy because functional field changed
			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 modified (test-command)');
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete deployment workflow', async () => {
			// Set up comprehensive test scenario
			const commands = [
				{
					name: 'help',
					data: {
						toJSON: () => ({
							name: 'help',
							description: 'Get help information',
							options: [],
						}),
					},
				},
				{
					name: 'ping',
					data: {
						toJSON: () => ({
							name: 'ping',
							description: 'Check bot latency',
							options: [],
						}),
					},
				},
			];

			commands.forEach(cmd => mockClient.commands.set(cmd.name, cmd));

			// Mock existing commands (none)
			mockRest.get.mockResolvedValue([]);

			// Mock successful deployment
			mockRest.put.mockResolvedValue(commands.map(cmd => ({ name: cmd.name })));

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Checking if command deployment is needed...');
			expect(LogEngine.debug).toHaveBeenCalledWith('Fetching existing commands from Discord...');
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 2 added (help, ping)');
			expect(LogEngine.info).toHaveBeenCalledWith('Deploying 2 commands to Discord...');
			expect(LogEngine.info).toHaveBeenCalledWith('Successfully deployed 2 slash commands to Discord API');
		});
	});
});