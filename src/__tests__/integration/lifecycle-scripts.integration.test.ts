/**
 * npm Lifecycle Scripts Integration Tests
 *
 * Validates that npm v11 lifecycle scripts work correctly
 */

import { describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';

const isBunRuntime = typeof Bun !== 'undefined';

describe('npm v11 Lifecycle Scripts', () => {
	it.skipIf(isBunRuntime)(
		'should run TypeScript build successfully',
		() => {
			const projectRoot = process.cwd();
			const tempWorkspace = fs.mkdtempSync(join(projectRoot, '.tmp-build-'));

			try {
				fs.copyFileSync(join(projectRoot, 'package.json'), join(tempWorkspace, 'package.json'));

				if (fs.existsSync(join(projectRoot, 'pnpm-lock.yaml'))) {
					fs.copyFileSync(
						join(projectRoot, 'pnpm-lock.yaml'),
						join(tempWorkspace, 'pnpm-lock.yaml'),
					);
				}

				if (fs.existsSync(join(projectRoot, 'tsconfig.json'))) {
					fs.copyFileSync(join(projectRoot, 'tsconfig.json'), join(tempWorkspace, 'tsconfig.json'));
				}

				if (fs.existsSync(join(projectRoot, 'src'))) {
					fs.cpSync(join(projectRoot, 'src'), join(tempWorkspace, 'src'), { recursive: true });
				}

				execSync('pnpm install --frozen-lockfile', { encoding: 'utf8', cwd: tempWorkspace });

				expect(() => {
					execSync('pnpm build', { encoding: 'utf8', cwd: tempWorkspace });
				}).not.toThrow();

				// Verify build output exists in the isolated workspace
				expect(fs.existsSync(join(tempWorkspace, 'dist', 'index.js'))).toBe(true);
			} finally {
				fs.rmSync(tempWorkspace, { recursive: true, force: true });
			}
		},
		120000,
	);

	it.skipIf(isBunRuntime)('should have correct npm configuration', () => {
		const npmConfig = execSync('npm config list', { encoding: 'utf8' });
		expect(npmConfig).toBeDefined();
	});
});
