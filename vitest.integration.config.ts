/**
 * Vitest Integration Test Configuration
 * 
 * Separate configuration for integration tests that make real network calls
 * and validate Node 24 + OpenSSL 3.5 compatibility
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Integration test specific settings
    globals: true,
    environment: 'node',
    
    // IMPORTANT: No setupFiles - integration tests use real implementations, not mocks
    // setupFiles: [], // Explicitly empty - no vitest.setup.ts mocking
    
    // Only run integration tests
    include: ['src/**/*.integration.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      'coverage'
    ],

    // Longer timeouts for network calls
    testTimeout: 30000,
    hookTimeout: 30000,

    // Run integration tests serially to avoid rate limits
    maxConcurrency: 1,
    
    // Coverage for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
      '@utils': resolve(__dirname, './src/utils'),
      '@services': resolve(__dirname, './src/services'),
      '@types': resolve(__dirname, './src/types')
    }
  }
});
