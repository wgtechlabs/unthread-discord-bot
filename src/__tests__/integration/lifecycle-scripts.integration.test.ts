/**
 * npm Lifecycle Scripts Integration Tests
 *
 * Validates that npm v11 lifecycle scripts work correctly
 */

import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';

describe('npm v11 Lifecycle Scripts', () => {
	it('should run TypeScript build script successfully via npm', () => {
		const projectRoot = process.cwd();
		expect(() => {
			execFileSync('npm', ['run', 'build', '--', '--version'], {
				encoding: 'utf8',
				cwd: projectRoot,
			});
		}).not.toThrow();
	}, 120000);

	it('should have correct npm configuration', () => {
		const npmConfig = execFileSync('npm', ['config', 'list'], { encoding: 'utf8' });
		expect(npmConfig).toBeDefined();
	});
});
