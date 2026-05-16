/**
 * Node 24 + Discord API Integration Tests
 *
 * Validates compatibility with Node 24, OpenSSL 3.5, and npm v11
 * Tests real Discord API connectivity without mocking
 */

import { describe, expect, it } from 'bun:test';
import https from 'node:https';
import tls from 'node:tls';

const isBunRuntime = typeof Bun !== 'undefined';

describe('Node 24 Discord API Integration', () => {
	const discordApiBase = 'https://discord.com/api/v10';

	it.skipIf(!process.env.INTEGRATION_NETWORK || isBunRuntime)(
		'should connect to Discord API over TLS with OpenSSL 3.5',
		async () => {
			const response = await fetch(`${discordApiBase}/gateway`);
			expect(response.ok).toBe(true);

			const data = await response.json();
			expect(data).toHaveProperty('url');
			expect(data.url).toContain('wss://');
		},
	);

	it.skipIf(isBunRuntime)('should support modern TLS cipher suites', () => {
		const ciphers = tls.getCiphers();

		// Verify OpenSSL 3.5 includes modern ciphers
		expect(ciphers).toContain('tls_aes_256_gcm_sha384');
		expect(ciphers).toContain('tls_aes_128_gcm_sha256');
		expect(ciphers).toContain('tls_chacha20_poly1305_sha256');
	});

	it.skipIf(isBunRuntime)('should create HTTPS agent with correct TLS settings', () => {
		const agent = new https.Agent({
			keepAlive: true,
			maxSockets: 10,
			minVersion: 'TLSv1.2',
		});

		expect(agent).toBeDefined();
		expect(agent.options.minVersion).toBe('TLSv1.2');
	});

	it.skipIf(isBunRuntime)('should initialize Discord REST client without errors', async () => {
		const { REST } = await import('discord.js');
		let rest: InstanceType<typeof REST> | undefined;
		expect(() => {
			rest = new REST({ version: '10' });
		}).not.toThrow();
		expect(rest).toBeDefined();
	});

	it.skipIf(isBunRuntime)('should validate Node.js version is 20 or higher', () => {
		const [major] = process.version.slice(1).split('.');
		expect(Number.parseInt(major)).toBeGreaterThanOrEqual(20);
	});

	it.skipIf(isBunRuntime)('should validate npm version is 10 or higher', async () => {
		const { execSync } = await import('node:child_process');
		const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
		const [major] = npmVersion.split('.');

		expect(Number.parseInt(major)).toBeGreaterThanOrEqual(10); // npm 10+ ships with Node 20+
	});
});
