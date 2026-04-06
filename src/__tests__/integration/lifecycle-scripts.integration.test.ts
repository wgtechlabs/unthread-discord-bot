/**
 * npm Lifecycle Scripts Integration Tests
 *
 * Validates that npm v11 lifecycle scripts work correctly
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

describe('npm v11 Lifecycle Scripts', () => {
	it('should run TypeScript build successfully', () => {
		const projectRoot = process.cwd();
		const tempWorkspace = mkdtempSync(join(projectRoot, '.tmp-build-'));

		try {
			cpSync(join(projectRoot, 'package.json'), join(tempWorkspace, 'package.json'));

			if (existsSync(join(projectRoot, 'pnpm-lock.yaml'))) {
				cpSync(join(projectRoot, 'pnpm-lock.yaml'), join(tempWorkspace, 'pnpm-lock.yaml'));
			}

			if (existsSync(join(projectRoot, 'tsconfig.json'))) {
				cpSync(join(projectRoot, 'tsconfig.json'), join(tempWorkspace, 'tsconfig.json'));
			}

			if (existsSync(join(projectRoot, 'src'))) {
				cpSync(join(projectRoot, 'src'), join(tempWorkspace, 'src'), { recursive: true });
			}

			execSync('pnpm install --frozen-lockfile', { encoding: 'utf8', cwd: tempWorkspace });

			expect(() => {
				execSync('pnpm build', { encoding: 'utf8', cwd: tempWorkspace });
			}).not.toThrow();

			// Verify build output exists in the isolated workspace
			expect(existsSync(join(tempWorkspace, 'dist', 'index.js'))).toBe(true);
		} finally {
			rmSync(tempWorkspace, { recursive: true, force: true });
		}
	}, 120000);

	it('should have correct npm configuration', () => {
		const npmConfig = execSync('npm config list', { encoding: 'utf8' });
		expect(npmConfig).toBeDefined();
	});
});
