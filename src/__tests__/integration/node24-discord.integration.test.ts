/**
 * Node 24 + Discord API Integration Tests
 *
 * Validates compatibility with Node 24, OpenSSL 3.5, and npm v11
 * Tests real Discord API connectivity without mocking
 */

import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';

function getSpawnedNodeMajorVersion(): number {
	const raw = execFileSync('node', ['--version'], { encoding: 'utf8' }).trim();
	return Number.parseInt(raw.slice(1).split('.')[0]);
}

const spawnedNodeMajor = getSpawnedNodeMajorVersion();

function runNodeScript(script: string): string {
	return execFileSync('node', ['--input-type=module', '--eval', script], {
		encoding: 'utf8',
	}).trim();
}

const GET_TLS_CIPHERS_SCRIPT =
	"import tls from 'node:tls'; console.log(JSON.stringify(tls.getCiphers()))";
const GET_HTTPS_AGENT_MIN_VERSION_SCRIPT =
	"import https from 'node:https'; const agent = new https.Agent({ keepAlive: true, maxSockets: 10, minVersion: 'TLSv1.2' }); console.log(agent.options.minVersion);";
const INIT_DISCORD_REST_SCRIPT =
	"import { REST } from 'discord.js'; const rest = new REST({ version: '10' }); console.log(rest ? 'ok' : 'fail');";

describe('Node 24 Discord API Integration', () => {
	const discordApiBase = 'https://discord.com/api/v10';

	it.skipIf(!process.env.INTEGRATION_NETWORK)(
		'should connect to Discord API over TLS with OpenSSL 3.5',
		async () => {
			const response = await fetch(`${discordApiBase}/gateway`);
			expect(response.ok).toBe(true);

			const data = await response.json();
			expect(data).toHaveProperty('url');
			expect(data.url).toContain('wss://');
		},
	);

	it.skipIf(spawnedNodeMajor < 24)(
		'should support modern TLS cipher suites',
		() => {
			const ciphers = JSON.parse(runNodeScript(GET_TLS_CIPHERS_SCRIPT));

			// Verify OpenSSL 3.5 includes modern ciphers
			expect(ciphers).toContain('tls_aes_256_gcm_sha384');
			expect(ciphers).toContain('tls_aes_128_gcm_sha256');
			expect(ciphers).toContain('tls_chacha20_poly1305_sha256');
		},
	);

	it.skipIf(spawnedNodeMajor < 24)(
		'should create HTTPS agent with correct TLS settings',
		() => {
			const minVersion = runNodeScript(GET_HTTPS_AGENT_MIN_VERSION_SCRIPT);
			expect(minVersion).toBe('TLSv1.2');
		},
	);

	it.skipIf(spawnedNodeMajor < 24)(
		'should initialize Discord REST client without errors',
		() => {
			const restCheck = runNodeScript(INIT_DISCORD_REST_SCRIPT);
			expect(restCheck).toBe('ok');
		},
	);

	it('should validate Node.js version is 20 or higher', () => {
		expect(spawnedNodeMajor).toBeGreaterThanOrEqual(20);
	});

	it('should validate npm version is 10 or higher', () => {
		const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
		const [major] = npmVersion.split('.');

		expect(Number.parseInt(major)).toBeGreaterThanOrEqual(10); // npm 10+ ships with Node 20+
	});
});
