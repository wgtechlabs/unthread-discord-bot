/**
 * Vitest Setup File
 *
 * Global test setup with comprehensive mocking for Discord.js, Unthread API,
 * and other external dependencies. Follows log-engine testing patterns.
 *
 * @module tests/vitest.setup
 */

import { vi, beforeEach } from 'vitest';

// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
process.env.CLIENT_ID = 'test-client-id';
process.env.GUILD_ID = 'test-guild-id';
process.env.UNTHREAD_API_KEY = 'test-api-key';
process.env.UNTHREAD_SLACK_CHANNEL_ID = 'test-slack-channel';
process.env.REDIS_URL = 'redis://localhost:6379/0';

/**
 * Global mock for Discord.js Client and related objects
 */
const mockDiscordUser = {
	id: 'test-user-123',
	username: 'testuser',
	displayName: 'Test User',
	avatar: 'test-avatar-hash',
	bot: false,
	system: false,
	flags: null,
	discriminator: '0000',
	tag: 'testuser#0000',
	createdAt: new Date('2023-01-01'),
	createdTimestamp: Date.now(),
};

const mockDiscordMessage = {
	id: 'test-message-123',
	content: 'Test message content',
	author: mockDiscordUser,
	channel: {
		id: 'test-channel-123',
		name: 'test-channel',
		/* GUILD_TEXT */
		type: 0,
		send: vi.fn().mockResolvedValue({}),
	},
	guild: {
		id: 'test-guild-123',
		name: 'Test Guild',
	},
	attachments: new Map(),
	createdAt: new Date(),
	createdTimestamp: Date.now(),
	editedAt: null,
	editedTimestamp: null,
	pinned: false,
	tts: false,
	embeds: [],
	mentions: {
		users: new Map(),
		roles: new Map(),
		channels: new Map(),
		everyone: false,
	},
	reactions: new Map(),
	reference: null,
	system: false,
	flags: null,
	/* DEFAULT */
	type: 0,
};

const mockDiscordClient = {
	user: {
		id: 'bot-user-123',
		username: 'TestBot',
		displayName: 'Test Bot',
		tag: 'TestBot#0000',
	},
	guilds: {
		cache: new Map(),
		fetch: vi.fn(),
	},
	channels: {
		cache: new Map(),
		fetch: vi.fn(),
	},
	users: {
		cache: new Map(),
		fetch: vi.fn(),
	},
	login: vi.fn().mockResolvedValue('test-token'),
	destroy: vi.fn().mockResolvedValue(undefined),
	on: vi.fn(),
	once: vi.fn(),
	emit: vi.fn(),
	isReady: () => true,
	readyAt: new Date(),
	uptime: 123456,
};

// Mock Discord.js module
vi.mock('discord.js', () => ({
	Client: vi.fn(() => mockDiscordClient),
	GatewayIntentBits: {
		Guilds: 1,
		GuildMessages: 512,
		MessageContent: 32768,
		DirectMessages: 4096,
	},
	Partials: {
		Channel: 'CHANNEL',
		Message: 'MESSAGE',
	},
	Collection: Map,
	EmbedBuilder: vi.fn(() => ({
		setTitle: vi.fn().mockReturnThis(),
		setDescription: vi.fn().mockReturnThis(),
		setColor: vi.fn().mockReturnThis(),
		setFooter: vi.fn().mockReturnThis(),
		setTimestamp: vi.fn().mockReturnThis(),
		addFields: vi.fn().mockReturnThis(),
		toJSON: vi.fn().mockReturnValue({}),
	})),
	Events: {
		MessageCreate: 'messageCreate',
		Ready: 'ready',
		InteractionCreate: 'interactionCreate',
	},
	REST: vi.fn(() => ({
		setToken: vi.fn(),
		put: vi.fn().mockResolvedValue([]),
	})),
	Routes: {
		applicationGuildCommands: vi.fn(() => '/applications/123/guilds/456/commands'),
	},
}));

/**
 * Mock fetch for Unthread API calls
 */
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Default fetch mock responses
beforeEach(() => {
	mockFetch.mockClear();

	// Default success response for Unthread API
	mockFetch.mockResolvedValue({
		ok: true,
		status: 200,
		statusText: 'OK',
		json: vi.fn().mockResolvedValue({
			data: {},
			success: true,
		}),
		text: vi.fn().mockResolvedValue('{}'),
		headers: new Headers(),
	});
});

/**
 * Mock Redis/Database connections
 */
vi.mock('@keyv/redis', () => ({
	default: vi.fn(() => ({
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(true),
		delete: vi.fn().mockResolvedValue(true),
		clear: vi.fn().mockResolvedValue(true),
		has: vi.fn().mockResolvedValue(false),
	})),
}));

vi.mock('keyv', () => ({
	default: vi.fn(() => ({
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(true),
		delete: vi.fn().mockResolvedValue(true),
		clear: vi.fn().mockResolvedValue(true),
		has: vi.fn().mockResolvedValue(false),
	})),
}));

/**
 * Mock LogEngine from @wgtechlabs/log-engine
 */
vi.mock('@wgtechlabs/log-engine', () => ({
	LogEngine: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		trace: vi.fn(),
		fatal: vi.fn(),
		configure: vi.fn(),
	},
	LogMode: {
		DEBUG: 'debug',
		INFO: 'info',
		WARN: 'warn',
		ERROR: 'error',
		TRACE: 'trace',
		FATAL: 'fatal',
	},
}));

/**
 * Mock Express server
 */
vi.mock('express', () => ({
	default: vi.fn(() => ({
		use: vi.fn(),
		post: vi.fn(),
		get: vi.fn(),
		listen: vi.fn((_port, callback) => {
			if (callback) callback();
			return { close: vi.fn() };
		}),
	})),
	json: vi.fn(),
	urlencoded: vi.fn(),
}));

/**
 * Mock file system operations
 */
vi.mock('fs', () => ({
	readdirSync: vi.fn().mockReturnValue([]),
	existsSync: vi.fn().mockReturnValue(true),
	readFileSync: vi.fn().mockReturnValue('{}'),
	writeFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
	readdirSync: vi.fn().mockReturnValue([]),
	existsSync: vi.fn().mockReturnValue(true),
	readFileSync: vi.fn().mockReturnValue('{}'),
	writeFileSync: vi.fn(),
}));

/**
 * Mock path operations
 */
vi.mock('path', () => ({
	join: vi.fn((...args) => args.join('/')),
	resolve: vi.fn((...args) => args.join('/')),
	dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
	basename: vi.fn((path) => path.split('/').pop()),
}));

vi.mock('node:path', () => ({
	join: vi.fn((...args) => args.join('/')),
	resolve: vi.fn((...args) => args.join('/')),
	dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
	basename: vi.fn((path) => path.split('/').pop()),
}));

/**
 * Global test utilities and mock factories
 */
(global as any).mockDiscordUser = mockDiscordUser;
(global as any).mockDiscordMessage = mockDiscordMessage;
(global as any).mockDiscordClient = mockDiscordClient;

/**
 * Set global Discord client mock
 */
global.discordClient = mockDiscordClient as any;

/**
 * Reset all mocks before each test
 */
beforeEach(() => {
	vi.clearAllMocks();
});