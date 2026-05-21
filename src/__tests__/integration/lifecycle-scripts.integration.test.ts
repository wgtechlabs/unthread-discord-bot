/**
 * Bun Lifecycle Scripts Integration Tests
 *
 * Validates that Bun lifecycle scripts work correctly
 */

import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';

describe('Bun Lifecycle Scripts', () => {
	it('should expose TypeScript compiler version through bun build script', () => {
		const projectRoot = process.cwd();
		const output = execFileSync('bun', ['run', 'build', '--', '--version'], {
			encoding: 'utf8',
			cwd: projectRoot,
		});
		expect(output).toMatch(/Version \d+\.\d+\.\d+/);
	}, 120000);

	it('should have correct bun configuration', () => {
		const bunConfig = execFileSync('bun', ['pm', 'ls'], { encoding: 'utf8' });
		expect(bunConfig).toBeDefined();
	});
});
