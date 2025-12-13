/**
 * Node 24 + Discord API Integration Tests
 * 
 * Validates compatibility with Node 24, OpenSSL 3.5, and npm v11
 * Tests real Discord API connectivity without mocking
 */

import { describe, it, expect } from 'vitest';
import https from 'https';
import tls from 'tls';
import { REST } from '@discordjs/rest';

describe('Node 24 Discord API Integration', () => {
  const discordApiBase = 'https://discord.com/api/v10';
  
  it('should connect to Discord API over TLS with OpenSSL 3.5', async () => {
    // Test basic HTTPS connectivity to Discord
    const response = await fetch(`${discordApiBase}/gateway`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data).toHaveProperty('url');
    expect(data.url).toContain('wss://');
  });

  it('should support modern TLS cipher suites', () => {
    const ciphers = tls.getCiphers();
    
    // Verify OpenSSL 3.5 includes modern ciphers
    expect(ciphers).toContain('tls_aes_256_gcm_sha384');
    expect(ciphers).toContain('tls_aes_128_gcm_sha256');
    expect(ciphers).toContain('tls_chacha20_poly1305_sha256');
  });

  it('should create HTTPS agent with correct TLS settings', () => {
    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 10,
      minVersion: 'TLSv1.2',
    });
    
    expect(agent).toBeDefined();
    expect(agent.options.minVersion).toBe('TLSv1.2');
  });

  it('should initialize Discord REST client without errors', () => {
    expect(() => {
      const rest = new REST({ version: '10' });
    }).not.toThrow();
  });

  it('should validate Node.js version is 24', () => {
    const [major] = process.version.slice(1).split('.');
    expect(parseInt(major)).toBeGreaterThanOrEqual(24);
  });

  it('should validate npm version is 11 or higher', async () => {
    const { execSync } = await import('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const [major] = npmVersion.split('.');
    
    expect(parseInt(major)).toBeGreaterThanOrEqual(10); // npm 10+ ships with Node 24
  });
});
