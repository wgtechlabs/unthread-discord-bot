/**
 * Vitest Configuration
 *
 * Comprehensive test configuration for the Discord bot with v8 coverage provider,
 * targeting 30% code coverage focused on core Discord ↔ Unthread messaging functionality.
 *
 * Coverage targets:
 * - Core business logic: message flow, attachment processing, API integration
 * - Supporting infrastructure: configuration, utilities, error handling
 *
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Use Node.js environment for Discord bot testing
    environment: 'node',
    
    // Test setup file with global mocks
    setupFiles: ['./src/__tests__/vitest.setup.ts'],
    
    // Global test configuration
    globals: true,
    
    // Coverage configuration with v8 provider
    coverage: {
      provider: 'v8',
      
      // 30% coverage thresholds for all metrics
      thresholds: {
        branches: 30,
        functions: 30,
        lines: 30,
        statements: 30,
      },
      
      // Include source files in coverage
      include: [
        'src/**/*.ts',
      ],
      
      // Exclude test files, build artifacts, and configuration
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'dist/**',
        'node_modules/**',
        'coverage/**',
        '**/*.d.ts',
        'src/deploy_commands.ts', // Deployment script
        'src/index.ts', // Main entry point with startup logic
      ],
      
      // Coverage reporters
      reporter: [
        'text',
        'json',
        'html',
        'lcov',
      ],
      
      // Coverage output directory
      reportsDirectory: './coverage',
    },
    
    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Retry failed tests once
    retry: 1,
  },
  
  // TypeScript path mapping resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './src/__tests__'),
    },
  },
  
  // Define constants for test environment
  define: {
    'process.env.NODE_ENV': '"test"',
  },
});