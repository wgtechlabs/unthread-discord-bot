/**
 * Vitest Configuration
 *
 * Comprehensive testing setup for the Discord bot with TypeScript support,
 * coverage reporting, and optimized test environment configuration.
 *
 * Key Features:
 * - V8 coverage provider for accurate coverage reporting
 * - TypeScript path mapping for clean imports
 * - Comprehensive exclusions to focus on relevant code
 * - Test environment setup with global mocks
 * - Coverage artifacts generation for CI/CD
 *
 * @see https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment setup
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/vitest.setup.ts'],
    
    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      '.github',
      '.vscode',
      '.devcontainer',
      'scripts',
      'docker',
      '**/*.d.ts',
      'coverage',
      'build',
      'tmp'
    ],

    // Coverage configuration with v8 provider
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '.git',
        '.github',
        '.vscode',
        '.devcontainer',
        'scripts',
        'docker',
        'coverage',
        'build',
        'tmp',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        'src/__tests__/**',
        // Exclude deployment and build scripts
        'src/deploy_commands.ts',
        // Exclude main entry point (difficult to test in isolation)
        'src/index.ts'
      ],
      // No hard thresholds - tracking only for now
      thresholds: {
        global: {
          statements: 0,
          branches: 0,
          functions: 0,
          lines: 0
        }
      },
      reportsDirectory: './coverage'
    },

    // Test performance and behavior
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1
      }
    },

    // Reporter configuration
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-results.html'
    }
  },

  // TypeScript path mapping for clean imports
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './src/__tests__'),
      '@utils': resolve(__dirname, './src/utils'),
      '@services': resolve(__dirname, './src/services'),
      '@config': resolve(__dirname, './src/config'),
      '@types': resolve(__dirname, './src/types'),
      '@events': resolve(__dirname, './src/events'),
      '@sdk': resolve(__dirname, './src/sdk')
    }
  },

  // Esbuild configuration for TypeScript
  esbuild: {
    target: 'node18'
  }
});