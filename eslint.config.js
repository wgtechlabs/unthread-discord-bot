const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const security = require('eslint-plugin-security');

module.exports = [
	// Base configuration for all files
	{
		ignores: ['dist/**', 'node_modules/**', '.yarn/**'],
	},
	// TypeScript files configuration
	{
		files: ['src/**/*.ts'],
		ignores: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/**/*'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2021,
				sourceType: 'module',
				project: './tsconfig.json',
				tsconfigRootDir: __dirname,
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': typescriptEslint,
			security: security,
		},
		rules: {
			// ESLint recommended rules
			'arrow-spacing': ['warn', { before: true, after: true }],
			'brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
			'comma-dangle': ['error', 'always-multiline'],
			'comma-spacing': 'error',
			'comma-style': 'error',
			'curly': ['error', 'multi-line', 'consistent'],
			'dot-location': ['error', 'property'],
			'handle-callback-err': 'off',
			'indent': ['error', 'tab'],
			'keyword-spacing': 'error',
			'max-nested-callbacks': ['error', { max: 4 }],
			'max-statements-per-line': ['error', { max: 2 }],
			'no-console': 'off',
			'no-empty-function': 'error',
			'no-floating-decimal': 'error',
			'no-inline-comments': 'error',
			'no-lonely-if': 'error',
			'no-multi-spaces': 'error',
			'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
			'no-shadow': 'off',
			'no-trailing-spaces': ['error'],
			'no-var': 'error',
			'object-curly-spacing': ['error', 'always'],
			'prefer-const': 'error',
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
			'space-before-blocks': 'error',
			'space-before-function-paren': ['error', {
				anonymous: 'never',
				named: 'never',
				asyncArrow: 'always',
			}],
			'space-in-parens': 'error',
			'space-infix-ops': 'error',
			'space-unary-ops': 'error',
			'spaced-comment': 'error',
			'yoda': 'error',

			// TypeScript ESLint rules
			'@typescript-eslint/no-shadow': ['error', { allow: ['err', 'resolve', 'reject'] }],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',

			// Security plugin rules - recommended set with some customizations for Discord bot
			'security/detect-buffer-noassert': 'error',
			'security/detect-child-process': 'error',
			'security/detect-disable-mustache-escape': 'error',
			'security/detect-eval-with-expression': 'error',
			'security/detect-new-buffer': 'error',
			'security/detect-no-csrf-before-method-override': 'error',
			'security/detect-non-literal-fs-filename': 'warn', // Warn instead of error for flexibility
			'security/detect-non-literal-regexp': 'warn', // Warn for Discord message patterns
			'security/detect-non-literal-require': 'error',
			'security/detect-object-injection': 'warn', // Warn to allow dynamic property access
			'security/detect-possible-timing-attacks': 'warn',
			'security/detect-pseudoRandomBytes': 'error',
			'security/detect-unsafe-regex': 'error',
		},
	},
	// Test files configuration - separate from main TypeScript project
	{
		files: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2021,
				sourceType: 'module',
				// Don't use project config for test files since they're excluded from main tsconfig
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				// Vitest globals
				describe: 'readonly',
				it: 'readonly',
				test: 'readonly',
				expect: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly',
				vi: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': typescriptEslint,
		},
		rules: {
			// Relaxed rules for test files
			'@typescript-eslint/no-explicit-any': 'off',
			'security/detect-object-injection': 'off',
			'no-console': 'off',
			// Keep other basic rules
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'indent': ['error', 'tab'],
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
		},
	},
	// JavaScript files configuration (if any)
	{
		files: ['*.js', '**/*.js'],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: 'module',
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
			},
		},
		plugins: {
			security: security,
		},
		rules: {
			// Basic security rules for JS files
			'security/detect-buffer-noassert': 'error',
			'security/detect-child-process': 'error',
			'security/detect-eval-with-expression': 'error',
			'security/detect-new-buffer': 'error',
			'security/detect-non-literal-require': 'error',
			'security/detect-pseudoRandomBytes': 'error',
			'security/detect-unsafe-regex': 'error',
		},
	},
];