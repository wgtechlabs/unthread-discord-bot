/**
 * Test Suite: Command Deployment Utils
 *
 * Comprehensive tests for smart command deployment functionality including
 * command comparison, normalization, and Discord API integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, REST, Routes } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { deployCommandsIfNeeded } from '../../utils/commandDeployment';

// Mock Discord.js REST client
vi.mock('discord.js', async () => {
	const actual = await vi.importActual('discord.js') as any;
	return {
		...actual,
		REST: vi.fn().mockImplementation(() => ({
			setToken: vi.fn().mockReturnThis(),
			get: vi.fn(),
			put: vi.fn(),
		})),
		Routes: {
			applicationGuildCommands: vi.fn(),
		},
	};
});

describe('commandDeployment', () => {
	let mockClient: any;
	let mockRest: any;
	let mockCommands: Map<string, any>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'info').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'warn').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Set up environment variables
		process.env.DISCORD_BOT_TOKEN = 'test_bot_token';
		process.env.CLIENT_ID = 'test_client_id';
		process.env.GUILD_ID = 'test_guild_id';

		// Setup mock REST client
		mockRest = {
			setToken: vi.fn().mockReturnThis(),
			get: vi.fn(),
			put: vi.fn(),
		};
		(REST as any).mockImplementation(() => mockRest);

		// Setup mock Routes
		(Routes.applicationGuildCommands as any).mockReturnValue('mock_route');

		// Setup mock commands
		mockCommands = new Map();
		mockCommands.set('ping', {
			data: {
				toJSON: vi.fn().mockReturnValue({
					name: 'ping',
					description: 'Ping command',
					options: [],
				}),
			},
		});
		mockCommands.set('user', {
			data: {
				toJSON: vi.fn().mockReturnValue({
					name: 'user',
					description: 'User command',
					options: [],
				}),
			},
		});

		// Setup mock client
		mockClient = {
			commands: mockCommands,
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.DISCORD_BOT_TOKEN;
		delete process.env.CLIENT_ID;
		delete process.env.GUILD_ID;
	});

	describe('deployCommandsIfNeeded', () => {
		it('should skip deployment when environment variables are missing', async () => {
			delete process.env.DISCORD_BOT_TOKEN;

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
			mockClient.commands = new Map();

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(LogEngine.warn).toHaveBeenCalledWith('No local commands found to deploy');
		});

		it('should deploy commands when changes are detected', async () => {
			// Mock Discord API returning no existing commands
			mockRest.get.mockResolvedValue([]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(mockRest.get).toHaveBeenCalledWith('mock_route');
			expect(mockRest.put).toHaveBeenCalledWith('mock_route', {
				body: [
					{ name: 'ping', description: 'Ping command', options: [] },
					{ name: 'user', description: 'User command', options: [] },
				],
			});
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 2 added (ping, user)');
			expect(LogEngine.info).toHaveBeenCalledWith('Successfully deployed 2 slash commands to Discord API');
		});

		it('should skip deployment when commands are up-to-date', async () => {
			// Mock Discord API returning same commands
			mockRest.get.mockResolvedValue([
				{
					name: 'ping',
					description: 'Ping command',
					options: [],
					id: 'discord_id_1',
					application_id: 'app_id',
					version: '1',
				},
				{
					name: 'user',
					description: 'User command',
					options: [],
					id: 'discord_id_2',
					application_id: 'app_id',
					version: '2',
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(false);
			expect(mockRest.put).not.toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Commands are up-to-date (2 commands unchanged) - skipping deployment'
			);
		});

		it('should detect modified commands', async () => {
			// Mock Discord API returning commands with different descriptions
			mockRest.get.mockResolvedValue([
				{
					name: 'ping',
					description: 'Old ping description',
					options: [],
				},
				{
					name: 'user',
					description: 'User command',
					options: [],
				},
			]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 modified (ping)');
		});

		it('should detect removed commands', async () => {
			// Mock Discord API returning more commands than local
			mockRest.get.mockResolvedValue([
				{
					name: 'ping',
					description: 'Ping command',
					options: [],
				},
				{
					name: 'user',
					description: 'User command',
					options: [],
				},
				{
					name: 'deprecated',
					description: 'Deprecated command',
					options: [],
				},
			]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith('Command changes detected: 1 removed (deprecated)');
		});

		it('should handle API errors gracefully', async () => {
			const apiError = new Error('Discord API Error');
			mockRest.get.mockRejectedValue(apiError);

			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow('Discord API Error');
			expect(LogEngine.error).toHaveBeenCalledWith('Failed to deploy commands to Discord:', apiError);
		});

		it('should handle deployment errors', async () => {
			mockRest.get.mockResolvedValue([]);
			const deployError = new Error('Deployment failed');
			mockRest.put.mockRejectedValue(deployError);

			await expect(deployCommandsIfNeeded(mockClient as Client)).rejects.toThrow('Deployment failed');
			expect(LogEngine.error).toHaveBeenCalledWith('Failed to deploy commands to Discord:', deployError);
		});

		it('should handle multiple types of changes simultaneously', async () => {
			// Add a third command to local
			mockCommands.set('support', {
				data: {
					toJSON: vi.fn().mockReturnValue({
						name: 'support',
						description: 'Support command',
						options: [],
					}),
				},
			});

			// Mock Discord API returning different state
			mockRest.get.mockResolvedValue([
				{
					name: 'ping',
					description: 'Old ping description', // Modified
					options: [],
				},
				{
					name: 'deprecated',
					description: 'Deprecated command', // Removed
					options: [],
				},
			]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
				{ name: 'support', description: 'Support command' },
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Command changes detected: 2 added (user, support), 1 modified (ping), 1 removed (deprecated)'
			);
		});

		it('should normalize commands correctly for comparison', async () => {
			// Only keep ping command for this test
			mockCommands.clear();
			mockCommands.set('ping', {
				data: {
					toJSON: vi.fn().mockReturnValue({
						name: 'ping',
						description: 'Ping command',
						options: [],
					}),
				},
			});

			// Mock Discord command with metadata that should be ignored
			mockRest.get.mockResolvedValue([
				{
					name: 'ping',
					description: 'Ping command',
					options: [],
					id: 'discord_id',
					application_id: 'app_id',
					version: '1',
					default_member_permissions: null,
					dm_permission: true,
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			// Should not deploy because normalized commands are the same
			expect(result).toBe(false);
			expect(mockRest.put).not.toHaveBeenCalled();
			expect(LogEngine.info).toHaveBeenCalledWith(
				'Commands are up-to-date (1 commands unchanged) - skipping deployment'
			);
		});

		it('should sort options arrays for consistent comparison', async () => {
			// Create fresh commands map with only the test command
			mockCommands.clear();
			mockCommands.set('test', {
				data: {
					toJSON: vi.fn().mockReturnValue({
						name: 'test',
						description: 'Test command',
						options: [
							{ name: 'option_b', description: 'Option B' },
							{ name: 'option_a', description: 'Option A' },
						],
					}),
				},
			});

			// Mock Discord API returning same command with differently ordered options
			mockRest.get.mockResolvedValue([
				{
					name: 'test',
					description: 'Test command',
					options: [
						{ name: 'option_a', description: 'Option A' },
						{ name: 'option_b', description: 'Option B' },
					],
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			// Should not deploy because options are just differently ordered
			expect(result).toBe(false);
			expect(mockRest.put).not.toHaveBeenCalled();
		});

		it('should handle commands with complex nested structures', async () => {
			// Create command with complex options
			mockCommands.set('complex', {
				data: {
					toJSON: vi.fn().mockReturnValue({
						name: 'complex',
						description: 'Complex command',
						options: [
							{
								name: 'subcommand',
								description: 'Subcommand',
								type: 1,
								options: [
									{ name: 'param', description: 'Parameter', type: 3 },
								],
							},
						],
					}),
				},
			});

			mockRest.get.mockResolvedValue([]);
			mockRest.put.mockResolvedValue([
				{
					name: 'complex',
					description: 'Complex command',
					options: [
						{
							name: 'subcommand',
							description: 'Subcommand',
							type: 1,
							options: [
								{ name: 'param', description: 'Parameter', type: 3 },
							],
						},
					],
				},
			]);

			const result = await deployCommandsIfNeeded(mockClient as Client);

			expect(result).toBe(true);
			expect(mockRest.put).toHaveBeenCalledWith('mock_route', {
				body: expect.arrayContaining([
					expect.objectContaining({
						name: 'complex',
						options: expect.arrayContaining([
							expect.objectContaining({
								name: 'subcommand',
								options: expect.arrayContaining([
									expect.objectContaining({ name: 'param' }),
								]),
							}),
						]),
					}),
				]),
			});
		});
	});

	describe('REST client initialization', () => {
		it('should initialize REST client with correct token', async () => {
			mockRest.get.mockResolvedValue([]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			await deployCommandsIfNeeded(mockClient as Client);

			expect(REST).toHaveBeenCalledTimes(1);
			expect(mockRest.setToken).toHaveBeenCalledWith('test_bot_token');
		});

		it('should use correct Discord API routes', async () => {
			mockRest.get.mockResolvedValue([]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			await deployCommandsIfNeeded(mockClient as Client);

			expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('test_client_id', 'test_guild_id');
		});
	});

	describe('logging', () => {
		it('should log deployment process steps', async () => {
			mockRest.get.mockResolvedValue([]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			await deployCommandsIfNeeded(mockClient as Client);

			expect(LogEngine.info).toHaveBeenCalledWith('Checking if command deployment is needed...');
			expect(LogEngine.debug).toHaveBeenCalledWith('Fetching existing commands from Discord...');
			expect(LogEngine.info).toHaveBeenCalledWith('Deploying 2 commands to Discord...');
		});

		it('should log detailed change information', async () => {
			mockRest.get.mockResolvedValue([
				{ name: 'old_command', description: 'Old command' },
			]);
			mockRest.put.mockResolvedValue([
				{ name: 'ping', description: 'Ping command' },
				{ name: 'user', description: 'User command' },
			]);

			await deployCommandsIfNeeded(mockClient as Client);

			expect(LogEngine.info).toHaveBeenCalledWith(
				'Command changes detected: 2 added (ping, user), 1 removed (old_command)'
			);
		});
	});
});