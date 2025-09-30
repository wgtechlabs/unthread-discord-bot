/**
 * Test Utilities
 *
 * Reusable utilities and mocks for test files.
 * Following KISS and Clean Code principles.
 *
 * @module __tests__/test-utils
 */

import { Attachment } from 'discord.js';

/**
 * Mock Discord.js Collection implementation
 * Provides essential Collection methods for testing
 */
export class MockCollection<K, V> extends Map<K, V> {
	some(fn: (value: V, key: K, collection: this) => boolean): boolean {
		for (const [key, value] of this) {
			if (fn(value, key, this)) {
				return true;
			}
		}
		return false;
	}

	filter(fn: (value: V, key: K, collection: this) => boolean): MockCollection<K, V> {
		const filtered = new MockCollection<K, V>();
		for (const [key, value] of this) {
			if (fn(value, key, this)) {
				filtered.set(key, value);
			}
		}
		return filtered;
	}

	reduce<T>(fn: (accumulator: T, value: V, key: K, collection: this) => T, initialValue: T): T {
		let accumulator = initialValue;
		for (const [key, value] of this) {
			accumulator = fn(accumulator, value, key, this);
		}
		return accumulator;
	}

	forEach(fn: (value: V, key: K, collection: this) => void): void {
		for (const [key, value] of this) {
			fn(value, key, this);
		}
	}
}

/**
 * Create a mock Discord Attachment for testing
 */
export const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
	id: 'test-attachment-id',
	name: 'test.png',
	contentType: 'image/png',
	size: 1024,
	url: 'https://example.com/test.png',
	proxyURL: 'https://example.com/proxy/test.png',
	width: 100,
	height: 100,
	ephemeral: false,
	description: null,
	duration: null,
	waveform: null,
	flags: null,
	...overrides,
} as Attachment);