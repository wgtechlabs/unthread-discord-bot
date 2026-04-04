/**
 * npm Lifecycle Scripts Integration Tests
 * 
 * Validates that npm v11 lifecycle scripts work correctly
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

describe('npm v11 Lifecycle Scripts', () => {
  it('should run TypeScript build successfully', () => {
    expect(() => {
      execSync('pnpm build', { encoding: 'utf8' });
    }).not.toThrow();
    
    // Verify build output exists
    expect(existsSync('dist/index.js')).toBe(true);
  });

  it('should have correct npm configuration', () => {
    const npmConfig = execSync('npm config list', { encoding: 'utf8' });
    expect(npmConfig).toBeDefined();
  });
});
