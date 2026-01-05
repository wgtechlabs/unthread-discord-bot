/**
 * Vitest Setup File
 *
 * Comprehensive global mocking and test environment setup for the Discord bot.
 * This file is automatically loaded before all tests run, ensuring consistent
 * test isolation and preventing external API calls.
 *
 * Mocked Systems:
 * - Discord.js: Complete client and event system mocking
 * - Unthread API: Fetch-based API call mocking
 * - Redis/Database: Storage layer mocking
 * - LogEngine: Logging system mocking
 * - Express server: HTTP server mocking
 * - File system operations: Safe test file operations
 *
 * @module __tests__/vitest.setup
 */

import { vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_BOT_TOKEN = 'test_bot_token_12345';
process.env.CLIENT_ID = 'test_client_id';
process.env.GUILD_ID = 'test_guild_id';
process.env.UNTHREAD_API_KEY = 'test_unthread_api_key';
process.env.UNTHREAD_SLACK_CHANNEL_ID = 'test_slack_channel';
process.env.UNTHREAD_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.REDIS_URL = 'redis://localhost:6379/0';
process.env.DEBUG_MODE = 'false';
process.env.PORT = '3000';

// =============================================================================
// DISCORD.JS MOCKING
// =============================================================================

// Mock Discord.js Client and related classes
vi.mock('discord.js', () => {
	const mockUser = {
		id: 'test_user_id',
		username: 'testuser',
		displayName: 'Test User',
		discriminator: '0001',
		avatar: 'test_avatar_hash',
		bot: false,
		system: false,
		tag: 'testuser#0001',
	};

	const mockThread = {
		id: 'test_thread_id',
		name: 'Test Thread',
		// GUILD_PUBLIC_THREAD
		type: 11,
		parentId: 'test_parent_channel_id',
		ownerId: 'test_owner_id',
		archived: false,
		locked: false,
		send: vi.fn().mockResolvedValue({ id: 'thread_message_id' }),
		setName: vi.fn().mockResolvedValue({}),
		setArchived: vi.fn().mockResolvedValue({}),
	};

	const mockChannel = {
		id: 'test_channel_id',
		name: 'test-channel',
		// GUILD_TEXT
		type: 0,
		send: vi.fn().mockResolvedValue({ id: 'sent_message_id' }),
		threads: {
			create: vi.fn().mockResolvedValue(mockThread),
			fetch: vi.fn().mockResolvedValue(new Map([['test_thread_id', mockThread]])),
		},
	};

	const mockGuild = {
		id: 'test_guild_id',
		name: 'Test Guild',
		channels: {
			cache: new Map([['test_channel_id', mockChannel]]),
			fetch: vi.fn().mockResolvedValue(mockChannel),
		},
		members: {
			cache: new Map(),
			fetch: vi.fn().mockResolvedValue({}),
		},
	};

	class MockClient {
		user = mockUser;
		guilds = {
			cache: new Map([['test_guild_id', mockGuild]]),
			fetch: vi.fn().mockResolvedValue(mockGuild),
		};
		channels = {
			cache: new Map([['test_channel_id', mockChannel]]),
			fetch: vi.fn().mockResolvedValue(mockChannel),
		};
		login = vi.fn().mockResolvedValue('test_token');
		on = vi.fn();
		once = vi.fn();
		emit = vi.fn();
		destroy = vi.fn().mockResolvedValue({});
		commands = new Map();
	}

	class MockEmbedBuilder {
		setTitle = vi.fn().mockReturnThis();
		setDescription = vi.fn().mockReturnThis();
		setColor = vi.fn().mockReturnThis();
		setFooter = vi.fn().mockReturnThis();
		setTimestamp = vi.fn().mockReturnThis();
		addFields = vi.fn().mockReturnThis();
		setAuthor = vi.fn().mockReturnThis();
		setImage = vi.fn().mockReturnThis();
		setThumbnail = vi.fn().mockReturnThis();
		setURL = vi.fn().mockReturnThis();
		toJSON = vi.fn().mockReturnValue({});
	}

	const mockCollection = Map;

	return {
		Client: MockClient,
		GatewayIntentBits: {
			Guilds: 1,
			GuildMessages: 512,
			MessageContent: 32768,
			GuildMessageReactions: 64,
		},
		Events: {
			Ready: 'ready',
			MessageCreate: 'messageCreate',
			MessageDelete: 'messageDelete',
			InteractionCreate: 'interactionCreate',
			ThreadCreate: 'threadCreate',
			Error: 'error',
		},
		EmbedBuilder: MockEmbedBuilder,
		Collection: mockCollection,
		ChannelType: {
			GuildText: 0,
			DM: 1,
			GuildVoice: 2,
			GroupDM: 3,
			GuildCategory: 4,
			GuildNews: 5,
			AnnouncementThread: 10,
			PublicThread: 11,
			PrivateThread: 12,
			GuildStageVoice: 13,
			GuildDirectory: 14,
			GuildForum: 15,
		},
		AttachmentBuilder: vi.fn().mockImplementation((buffer, name) => ({
			attachment: buffer,
			name: name,
			description: undefined,
			contentType: undefined,
		})),
		// Mock commonly used Discord.js utilities
		userMention: vi.fn((id) => `<@${id}>`),
		channelMention: vi.fn((id) => `<#${id}>`),
		roleMention: vi.fn((id) => `<@&${id}>`),
		time: vi.fn((timestamp) => `<t:${Math.floor(timestamp / 1000)}>`),
		// Mock permissions
		PermissionFlagsBits: {
			SendMessages: BigInt(2048),
			ManageMessages: BigInt(8192),
			ReadMessageHistory: BigInt(65536),
			UseExternalEmojis: BigInt(262144),
		},
	};
});

// =============================================================================
// UNTHREAD API MOCKING
// =============================================================================

// Mock global fetch for Unthread API calls
global.fetch = vi.fn();

// Default fetch implementation for successful API responses
const mockFetchImplementation = vi.fn((url: string | Request, options?: any) => {
	const urlStr = typeof url === 'string' ? url : (url as Request).url;

	// Mock customer creation response
	if (urlStr.includes('/customers') && options?.method === 'POST') {
		return Promise.resolve({
			ok: true,
			status: 201,
			json: () => Promise.resolve({
				customerId: 'test_customer_id_12345',
				email: 'test@example.com',
				name: 'Test User',
			}),
		});
	}

	// Mock ticket creation response
	if (urlStr.includes('/conversations') && options?.method === 'POST') {
		return Promise.resolve({
			ok: true,
			status: 201,
			json: () => Promise.resolve({
				conversationId: 'test_ticket_id_12345',
				title: 'Test Ticket',
				status: 'open',
				customer: {
					customerId: 'test_customer_id_12345',
					email: 'test@example.com',
				},
			}),
		});
	}

	// Mock message posting response
	if (urlStr.includes('/conversations/') && urlStr.includes('/messages') && options?.method === 'POST') {
		return Promise.resolve({
			ok: true,
			status: 201,
			json: () => Promise.resolve({
				messageId: 'test_message_id_12345',
				content: options.body ? JSON.parse(options.body).markdown : 'Test message',
			}),
		});
	}

	// Default successful response
	return Promise.resolve({
		ok: true,
		status: 200,
		json: () => Promise.resolve({ success: true }),
	});
});

// Apply the mock implementation
(global.fetch as any).mockImplementation(mockFetchImplementation);

// =============================================================================
// REDIS/DATABASE MOCKING
// =============================================================================

// Mock @keyv/redis
vi.mock('@keyv/redis', () => ({
	default: vi.fn().mockImplementation(() => ({
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(true),
		delete: vi.fn().mockResolvedValue(true),
		clear: vi.fn().mockResolvedValue(true),
		has: vi.fn().mockResolvedValue(false),
	})),
}));

// Mock keyv
vi.mock('keyv', () => ({
	default: class MockKeyv {
		get = vi.fn().mockResolvedValue(null);
		set = vi.fn().mockResolvedValue(true);
		delete = vi.fn().mockResolvedValue(true);
		clear = vi.fn().mockResolvedValue(true);
		has = vi.fn().mockResolvedValue(false);
	},
}));

// Mock ioredis
vi.mock('ioredis', () => ({
	default: vi.fn().mockImplementation(() => ({
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue('OK'),
		del: vi.fn().mockResolvedValue(1),
		exists: vi.fn().mockResolvedValue(0),
		expire: vi.fn().mockResolvedValue(1),
		flushall: vi.fn().mockResolvedValue('OK'),
		quit: vi.fn().mockResolvedValue('OK'),
		on: vi.fn(),
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
	})),
}));

// Mock pg (PostgreSQL)
vi.mock('pg', () => ({
	Pool: class MockPool {
		connect = vi.fn().mockResolvedValue({
			query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
			release: vi.fn(),
		});
		query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
		end = vi.fn().mockResolvedValue(undefined);
	},
}));

// =============================================================================
// LOGENGINE MOCKING
// =============================================================================

// Mock @wgtechlabs/log-engine
vi.mock('@wgtechlabs/log-engine', () => ({
	LogEngine: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		trace: vi.fn(),
		success: vi.fn(),
		log: vi.fn(),
		configure: vi.fn(),
	},
	LogMode: {
		DEBUG: 'debug',
		INFO: 'info',
		WARN: 'warn',
		ERROR: 'error',
	},
}));

// =============================================================================
// EXPRESS SERVER MOCKING
// =============================================================================

// Mock Express for webhook server
vi.mock('express', () => {
	const mockApp = {
		use: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		listen: vi.fn((_port, callback) => {
			if (callback) callback();
			return { close: vi.fn() };
		}),
		set: vi.fn(),
	};

	const expressMock = vi.fn(() => mockApp) as any;
	expressMock.json = vi.fn();
	expressMock.urlencoded = vi.fn();
	expressMock.static = vi.fn();

	return {
		default: expressMock,
		json: vi.fn(),
		urlencoded: vi.fn(),
		static: vi.fn(),
	};
});

// =============================================================================
// FILE SYSTEM MOCKING
// =============================================================================

// Mock fs operations for safe testing
vi.mock('fs', () => ({
	readdirSync: vi.fn().mockReturnValue([]),
	readFileSync: vi.fn().mockReturnValue(''),
	writeFileSync: vi.fn(),
	existsSync: vi.fn().mockReturnValue(true),
	mkdirSync: vi.fn(),
	statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
	promises: {
		readFile: vi.fn().mockResolvedValue(''),
		writeFile: vi.fn().mockResolvedValue(undefined),
		mkdir: vi.fn().mockResolvedValue(undefined),
		stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
	},
}));

// =============================================================================
// DOTENV MOCKING
// =============================================================================

// Mock dotenv
vi.mock('dotenv', () => ({
	config: vi.fn(),
}));

// =============================================================================
// TEST LIFECYCLE HOOKS
// =============================================================================

// Global test setup
beforeAll(() => {
	// Suppress console warnings in tests unless debugging
	if (!process.env.VITEST_DEBUG) {
		vi.spyOn(console, 'warn').mockImplementation(() => {
			// Intentionally empty - suppressing console output in tests
		});
		vi.spyOn(console, 'error').mockImplementation(() => {
			// Intentionally empty - suppressing console output in tests
		});
	}
});

// Reset mocks between tests
beforeEach(() => {
	vi.clearAllMocks();

	// Reset fetch mock to default implementation
	(global.fetch as any).mockImplementation(mockFetchImplementation);
});

// Cleanup after each test
afterEach(() => {
	vi.clearAllTimers();
});

// Global test cleanup
afterAll(() => {
	vi.restoreAllMocks();
});