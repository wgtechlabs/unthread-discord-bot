/**
 * Test Suite: Ping Command
 *
 * Comprehensive tests for the ping command module.
 * Tests cover command structure, API latency calculation, WebSocket heartbeat retrieval,
 * embed formatting, and error handling scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { data as pingData, execute as pingExecute } from '../../../commands/utilities/ping';

// Test constants
const MOCK_WEBSOCKET_PING = 45; // Default WebSocket ping value for tests

describe('Ping Command', () => {
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	let mockSentMessage: any;
	let mockClient: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock sent message
		mockSentMessage = {
			createdTimestamp: 1640995800, // Mock timestamp (in seconds since epoch)
		};

		// Create mock client with WebSocket
		mockClient = {
			ws: {
				ping: MOCK_WEBSOCKET_PING, // Mock WebSocket ping
			},
		};

		// Create mock interaction
		mockInteraction = {
			createdTimestamp: 1640995700, // 100ms earlier than sent message
			client: mockClient,
			deferReply: vi.fn().mockResolvedValue(mockSentMessage),
			editReply: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe('Command Structure', () => {
		it('should have correct command data structure', () => {
			// Check that pingData has the correct properties instead of instanceof
			expect(pingData.name).toBe('ping');
			expect(pingData.description).toBe('Shows bot latency and API ping metrics.');
			expect(typeof pingData.setName).toBe('function');
			expect(typeof pingData.setDescription).toBe('function');
		});

		it('should export execute function', () => {
			expect(typeof pingExecute).toBe('function');
		});
	});

	describe('API Latency Calculation', () => {
		it('should calculate API latency correctly', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			// API latency should be the difference between sent and interaction timestamps
			const expectedLatency = mockSentMessage.createdTimestamp - mockInteraction.createdTimestamp!;
			expect(expectedLatency).toBe(100);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: '100ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle zero latency', async () => {
			// Set same timestamp for both
			mockSentMessage.createdTimestamp = mockInteraction.createdTimestamp;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: '0ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle negative latency (clock skew)', async () => {
			// Set sent timestamp earlier than interaction timestamp
			mockSentMessage.createdTimestamp = mockInteraction.createdTimestamp! - 50;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: '-50ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});
	});

	describe('WebSocket Heartbeat Retrieval', () => {
		it('should display WebSocket ping when available', async () => {
			mockClient.ws.ping = 25;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: '25ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should display N/A when WebSocket ping is not available', async () => {
			mockClient.ws.ping = -1;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: 'N/A',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should display N/A when WebSocket ping is zero', async () => {
			mockClient.ws.ping = 0;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: 'N/A',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle missing WebSocket object', async () => {
			mockClient.ws = undefined;

			// The command will throw an error when accessing undefined.ping
			await expect(pingExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow();
		});
	});

	describe('Embed Formatting and Structure', () => {
		it('should create embed with correct structure', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							color: 0xEB1A1A,
							title: '🏓 Pong!',
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: expect.stringMatching(/^\d+ms$/),
									inline: true,
								}),
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: expect.stringMatching(/^(\d+ms|N\/A)$/),
									inline: true,
								}),
							]),
							footer: expect.objectContaining({
								text: 'Discord Bot Latency Metrics',
							}),
							timestamp: expect.any(String),
						}),
					}),
				]),
			});
		});

		it('should set correct embed color', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			const editReplyCall = vi.mocked(mockInteraction.editReply).mock.calls[0];
			const embed = editReplyCall[0].embeds![0];
			expect(embed.data.color).toBe(0xEB1A1A);
		});

		it('should include timestamp', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			const editReplyCall = vi.mocked(mockInteraction.editReply).mock.calls[0];
			const embed = editReplyCall[0].embeds![0];
			expect(embed.data.timestamp).toBeDefined();
		});

		it('should have correct footer text', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			const editReplyCall = vi.mocked(mockInteraction.editReply).mock.calls[0];
			const embed = editReplyCall[0].embeds![0];
			expect(embed.data.footer?.text).toBe('Discord Bot Latency Metrics');
		});
	});

	describe('Deferred Reply Handling', () => {
		it('should defer reply with fetchReply option', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.deferReply).toHaveBeenCalledWith({ fetchReply: true });
		});

		it('should edit reply after calculating metrics', async () => {
			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.deferReply).toHaveBeenCalled();
			expect(mockInteraction.editReply).toHaveBeenCalledAfter(vi.mocked(mockInteraction.deferReply));
		});

		it('should handle deferReply failure', async () => {
			mockInteraction.deferReply = vi.fn().mockRejectedValue(new Error('Defer failed'));

			await expect(pingExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Defer failed');
		});

		it('should handle editReply failure', async () => {
			mockInteraction.editReply = vi.fn().mockRejectedValue(new Error('Edit failed'));

			await expect(pingExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow('Edit failed');
		});
	});

	describe('Edge Cases and Error Scenarios', () => {
		it('should handle missing client object', async () => {
			mockInteraction.client = undefined;

			// The command will throw an error when accessing undefined.ws
			await expect(pingExecute(mockInteraction as ChatInputCommandInteraction)).rejects.toThrow();
		});

		it('should handle very large latency values', async () => {
			mockSentMessage.createdTimestamp = mockInteraction.createdTimestamp! + 99999;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: '99999ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle very large WebSocket ping values', async () => {
			mockClient.ws.ping = 999999;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: '999999ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});

		it('should handle floating point WebSocket ping values', async () => {
			mockClient.ws.ping = 45.5;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'WebSocket Heartbeat',
									value: '45.5ms',
									inline: true,
								}),
							]),
						}),
					}),
				]),
			});
		});
	});

	describe('Timestamp Calculations', () => {
		it('should use createdTimestamp from both interaction and sent message', async () => {
			const interactionTime = 1640995600;
			const sentTime = 1640995750;

			mockInteraction.createdTimestamp = interactionTime;
			mockSentMessage.createdTimestamp = sentTime;

			await pingExecute(mockInteraction as ChatInputCommandInteraction);

			const expectedLatency = sentTime - interactionTime;
			expect(expectedLatency).toBe(150);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: 'API Latency',
									value: '150ms',
								}),
							]),
						}),
					}),
				]),
			});
		});
	});
});