import { beforeEach, describe, expect, it, jest as vi, mock } from 'bun:test';

mock.module('discord.js', () => {
	class MockAttachmentBuilder {
		attachment: Buffer;
		name?: string;
		description?: string;

		constructor(buffer: Buffer, options?: { name?: string; description?: string }) {
			this.attachment = buffer;
			this.name = options?.name;
			this.description = options?.description;
		}
	}

	class MockEmbedBuilder {
		setColor = vi.fn().mockReturnThis();
		setTitle = vi.fn().mockReturnThis();
		setDescription = vi.fn().mockReturnThis();
		setFooter = vi.fn().mockReturnThis();
		setTimestamp = vi.fn().mockReturnThis();
	}

	return {
		AttachmentBuilder: MockAttachmentBuilder,
		Collection: Map,
		EmbedBuilder: MockEmbedBuilder,
	};
});

import { AttachmentHandler } from '@utils/attachmentHandler';

function createFetchResponse(body: Buffer, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
		arrayBuffer: vi.fn().mockResolvedValue(
			body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
		),
	};
}

function createDiscordThread() {
	return {
		id: 'discord-thread-1',
		send: vi.fn().mockResolvedValue({ id: 'discord-message-1' }),
	};
}

describe('AttachmentHandler Unthread downloads', () => {
	beforeEach(() => {
		(global.fetch as any).mockReset();
	});

	it('downloads webhook files through the conversation-scoped fallback when no direct URL is present', async () => {
		const body = Buffer.from([1, 2, 3, 4]);
		(global.fetch as any).mockResolvedValueOnce(createFetchResponse(body));
		const discordThread = createDiscordThread();
		const attachmentHandler = new AttachmentHandler();

		const result = await attachmentHandler.downloadUnthreadFilesToDiscord(
			discordThread as any,
			[
				{
					id: 'file_123',
					name: 'dashboard-image.png',
					size: body.length,
					mimetype: 'image/png',
				},
			],
			undefined,
			'conversation 123',
		);

		expect(result.success).toBe(true);
		expect(result.processedCount).toBe(1);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.unthread.io/api/conversations/conversation%20123/files/file_123/full',
			expect.objectContaining({
				method: 'GET',
				headers: expect.objectContaining({
					'X-API-KEY': 'test_unthread_api_key',
					'User-Agent': 'unthread-discord-bot',
				}),
			}),
		);
		expect(discordThread.send).toHaveBeenCalledTimes(1);
	});

	it('ignores non-Unthread direct URLs and falls back to conversation file downloads', async () => {
		const body = Buffer.from([5, 6, 7]);
		(global.fetch as any).mockResolvedValueOnce(createFetchResponse(body));
		const discordThread = createDiscordThread();
		const attachmentHandler = new AttachmentHandler();

		const result = await attachmentHandler.downloadUnthreadFilesToDiscord(
			discordThread as any,
			[
				{
					id: 'file_456',
					name: 'unsafe-url-image.png',
					size: body.length,
					filetype: 'png',
					urlPrivateDownload: 'https://example.invalid/file.png',
				},
			],
			undefined,
			'conv-456',
		);

		expect(result.success).toBe(true);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.unthread.io/api/conversations/conv-456/files/file_456/full',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(discordThread.send).toHaveBeenCalledTimes(1);
	});

	it('uses direct Unthread API URLs when provided by the webhook payload', async () => {
		const body = Buffer.from([8, 9]);
		(global.fetch as any).mockResolvedValueOnce(createFetchResponse(body));
		const discordThread = createDiscordThread();
		const attachmentHandler = new AttachmentHandler();

		const result = await attachmentHandler.downloadUnthreadFilesToDiscord(
			discordThread as any,
			[
				{
					id: 'file_789',
					name: 'direct-url-image.png',
					size: body.length,
					mimetype: 'image/png',
					urlPrivateDownload: 'https://api.unthread.io/api/files/file_789/full',
				},
			],
			undefined,
			'conv-789',
		);

		expect(result.success).toBe(true);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.unthread.io/api/files/file_789/full',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(discordThread.send).toHaveBeenCalledTimes(1);
	});
});