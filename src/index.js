/**
 * Unthread Discord Bot - Main Entry Point
 * 
 * This is the primary server file that initializes the Discord bot and Express webhook server.
 * The bot connects to Discord and handles slash commands, while the Express server
 * receives webhooks from Unthread to sync ticket updates.
 * 
 * Key Components:
 * - Discord.js Client with required intents and partials
 * - Express server for webhook handling
 * - Command and event loader system
 * - Global client reference for webhook integration
 * 
 * @module index
 * @author Waren Gonzaga
 * @version 0.2.0-beta.6.10
 */

const fs = require("fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const { webhookHandler } = require('./services/webhook');
const logger = require('./utils/logger');

require("dotenv").config();

// Load Discord bot token from environment variables
const { DISCORD_BOT_TOKEN } = process.env;

/**
 * Discord Client Configuration
 * 
 * Configures the Discord client with necessary intents and partials:
 * - Guilds: Basic guild functionality
 * - MessageContent: Access to message content (required for content reading)
 * - GuildMessages: Message events in guilds
 * - GuildMessageReactions: Reaction events
 * 
 * Partials allow the bot to receive events for objects that may not be fully cached:
 * - Channel, Message, Reaction: For incomplete message data
 * - ThreadMember, Thread: For thread-related events
 */
const client = new Client({ 
	intents: [
		GatewayIntentBits.Guilds, 
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
	],
	partials: [
		Partials.Channel,
		Partials.Message,
		Partials.Reaction,
		Partials.ThreadMember,
		Partials.Thread
	]
});

/**
 * Express Middleware Configuration
 * 
 * Configures JSON parsing with raw body capture for webhook signature verification.
 * The raw body is needed to verify HMAC signatures from Unthread webhooks.
 */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    }
  })
);

/**
 * Webhook Route Handler
 * 
 * Handles incoming webhooks from Unthread for ticket updates and synchronization.
 * All webhook processing is delegated to the webhookHandler service.
 */
app.post('/webhook/unthread', webhookHandler);

/**
 * Start Express Server
 * 
 * Starts the webhook server on the configured port.
 * This server must be publicly accessible for Unthread to send webhooks.
 */
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

/**
 * Don't modify or update the code below.
 * Keep your changes above ^
 */

/**
 * Command Loading System
 * 
 * Dynamically loads all slash commands from the commands directory structure.
 * Commands are organized in folders and must export 'data' and 'execute' properties.
 * Successfully loaded commands are registered in the client.commands Collection.
 */
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

/**
 * Event Loading System
 * 
 * Dynamically loads all event handlers from the events directory.
 * Events can be configured to run once or on every occurrence.
 * Each event file must export name, execute, and optionally 'once' properties.
 */
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
	.readdirSync(eventsPath)
	.filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

/**
 * Discord Client Login and Global Setup
 * 
 * Logs in the Discord client and sets up global reference for webhook access.
 * The global client reference allows the webhook handler to access Discord functionality.
 */
client.login(DISCORD_BOT_TOKEN)
  .then(() => {
    global.discordClient = client;
    logger.info('Discord client is ready and set globally.');
  })
  .catch(logger.error);
