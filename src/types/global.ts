/**
 * Global Type Declarations
 *
 * Contains global type declarations and augmentations for the application.
 * This file extends the global namespace with custom properties.
 *
 * @module types/global
 */

import { Client } from 'discord.js';

/**
 * Extended Discord Client with commands collection
 */
interface ExtendedClient extends Client {
	commands: Map<string, unknown>;
}

declare global {
	/**
	 * Discord client instance accessible globally for webhook integration
	 */
	// eslint-disable-next-line no-var
	var discordClient: ExtendedClient | undefined;
}

export {};