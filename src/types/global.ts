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

/**
 * Extended global Discord client interface for utilities that need Discord functionality
 */
interface GlobalDiscordClient {
	channels: {
		fetch: (channelId: string) => Promise<unknown>;
	};
}

declare global {
	/**
	 * Discord client instance accessible globally for webhook integration
	 */
	var discordClient: ExtendedClient | GlobalDiscordClient | undefined;
}

export {};