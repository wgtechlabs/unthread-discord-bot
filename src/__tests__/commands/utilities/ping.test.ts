/**
 * Test Suite: Ping Command
 *
 * Comprehensive tests for the ping command.
 * Tests cover command execution, latency calculation, and embed creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, Message } from 'discord.js';
import { execute, data } from '../../../commands/utilities/ping';

describe('ping command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockMessage: Partial<Message>;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock message with created timestamp
		mockMessage = {
			createdTimestamp: 1000,
		};

		// Setup mock interaction
		mockInteraction = {
			createdTimestamp: 500,
			deferReply: vi.fn().mockResolvedValue(mockMessage),
			editReply: vi.fn().mockResolvedValue(undefined),
			client: {
				ws: {
					ping: 45, // Mock WebSocket ping value
				},
			} as any,
		};
	});

	describe('command data', () => {
		it('should have correct command name', () => {
			expect(data.name).toBe('ping');
		});

		it('should have correct command description', () => {
			expect(data.description).toBe('Shows bot latency and API ping metrics.');
		});

		it('should be a valid SlashCommandBuilder instance', () => {
			expect(data).toBeDefined();
			expect(typeof data.toJSON).toBe('function');
		});
	});

	describe('execute function', () => {
		it('should defer reply and edit with latency information', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.deferReply).toHaveBeenCalledOnce();
			expect(mockInteraction.deferReply).toHaveBeenCalledWith({ fetchReply: true });
			expect(mockInteraction.editReply).toHaveBeenCalledOnce();
		});

		it('should calculate API latency correctly', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			// API latency should be message timestamp - interaction timestamp = 1000 - 500 = 500ms
			const apiLatencyField = embed.data.fields.find((field: any) => field.name === 'API Latency');
			expect(apiLatencyField).toBeDefined();
			expect(apiLatencyField.value).toBe('500ms');
		});

		it('should display WebSocket heartbeat when available', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			const wsField = embed.data.fields.find((field: any) => field.name === 'WebSocket Heartbeat');
			expect(wsField).toBeDefined();
			expect(wsField.value).toBe('45ms');
		});

		it('should display N/A for WebSocket heartbeat when unavailable', async () => {
			// Mock negative or zero ping
			mockInteraction.client!.ws.ping = -1;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			const wsField = embed.data.fields.find((field: any) => field.name === 'WebSocket Heartbeat');
			expect(wsField).toBeDefined();
			expect(wsField.value).toBe('N/A');
		});

		it('should create embed with correct structure', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			expect(editCall).toHaveProperty('embeds');
			expect(editCall.embeds).toHaveLength(1);

			const embed = editCall.embeds[0];
			expect(embed.data.color).toBe(0xEB1A1A);
			expect(embed.data.title).toBe('🏓 Pong!');
			expect(embed.data.fields).toHaveLength(2);
			expect(embed.data.footer?.text).toBe('Discord Bot Latency Metrics');
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should handle zero WebSocket ping', async () => {
			mockInteraction.client!.ws.ping = 0;

			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			const wsField = embed.data.fields.find((field: any) => field.name === 'WebSocket Heartbeat');
			expect(wsField.value).toBe('N/A');
		});

		it('should handle high latency values', async () => {
			// Mock high latency scenario
			mockMessage.createdTimestamp = 2500; // Higher timestamp for more latency
			mockInteraction.deferReply = vi.fn().mockResolvedValue(mockMessage);

			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			const apiLatencyField = embed.data.fields.find((field: any) => field.name === 'API Latency');
			expect(apiLatencyField.value).toBe('2000ms'); // 2500 - 500 = 2000ms
		});

		it('should handle deferReply errors', async () => {
			const deferError = new Error('Defer failed');
			mockInteraction.deferReply = vi.fn().mockRejectedValue(deferError);

			await expect(execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Defer failed');
		});

		it('should handle editReply errors', async () => {
			const editError = new Error('Edit failed');
			mockInteraction.editReply = vi.fn().mockRejectedValue(editError);

			await expect(execute(mockInteraction as ChatInputCommandInteraction))
				.rejects.toThrow('Edit failed');
		});
	});

	describe('embed fields validation', () => {
		it('should have correct field properties', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];
			
			const apiLatencyField = embed.data.fields[0];
			expect(apiLatencyField.name).toBe('API Latency');
			expect(apiLatencyField.inline).toBe(true);
			
			const wsField = embed.data.fields[1];
			expect(wsField.name).toBe('WebSocket Heartbeat');
			expect(wsField.inline).toBe(true);
		});

		it('should use consistent color scheme', async () => {
			await execute(mockInteraction as ChatInputCommandInteraction);

			const editCall = (mockInteraction.editReply as any).mock.calls[0][0];
			const embed = editCall.embeds[0];

			// Verify brand color (red: #EB1A1A)
			expect(embed.data.color).toBe(0xEB1A1A);
		});
	});
});