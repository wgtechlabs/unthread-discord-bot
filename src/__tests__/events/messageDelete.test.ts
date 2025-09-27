/**
 * Test Suite: Message Delete Event Handler
 *
 * Basic tests for the Discord.js messageDelete event handler.
 * Tests cover event configuration and basic functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Events, Message, User, TextChannel } from 'discord.js';
import { LogEngine } from '../../config/logger';
import { execute, name } from '../../events/messageDelete';

describe('messageDelete event handler', () => {
	let mockMessage: Partial<Message>;
	let mockChannel: Partial<TextChannel>;
	let mockAuthor: Partial<User>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock LogEngine methods
		vi.spyOn(LogEngine, 'debug').mockImplementation(() => {});
		vi.spyOn(LogEngine, 'error').mockImplementation(() => {});

		// Setup mock author (human user)
		mockAuthor = {
			bot: false,
			id: 'user123',
			username: 'testuser',
		};

		// Setup mock channel
		mockChannel = {
			id: 'channel123',
			name: 'general',
		};

		// Setup mock message
		mockMessage = {
			id: 'message123',
			author: mockAuthor as User,
			channel: mockChannel as TextChannel,
			content: 'Test message content',
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('event configuration', () => {
		it('should have correct event name', () => {
			expect(name).toBe(Events.MessageDelete);
		});
	});

	describe('bot message filtering', () => {
		it('should ignore bot messages', async () => {
			mockAuthor.bot = true;

			await execute(mockMessage as Message);

			// Since bot messages are filtered out, debug should not be called
			expect(LogEngine.debug).not.toHaveBeenCalled();
		});

		it('should process human user messages', async () => {
			mockAuthor.bot = false;

			await execute(mockMessage as Message);

			// Should process without errors
			expect(LogEngine.error).not.toHaveBeenCalled();
		});

		it('should handle messages with missing author', async () => {
			mockMessage.author = undefined;

			await execute(mockMessage as Message);

			// Should handle gracefully without errors
			expect(LogEngine.error).not.toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle execution errors gracefully', async () => {
			// Create a malformed message that might cause issues
			const malformedMessage = {} as Message;

			await execute(malformedMessage);

			// Should not throw - any errors should be logged
			expect(true).toBe(true); // Test passes if no exception thrown
		});
	});
});