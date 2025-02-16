const fs = require("fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const { handleWebhookEvent } = require('./services/unthread');
const { webhookHandler } = require('./services/webhook');

require("dotenv").config();

// load discord bot token
const { DISCORD_BOT_TOKEN } = process.env;

// discord bot instents and partials
const client = new Client({ 
	intents: [
		GatewayIntentBits.Guilds, 
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions
	],
	partials: [
		Partials.Channel,
		Partials.Message,
		Partials.Reaction
	]
});

/**
 * Don't modify or update the code below.
 * Keep your changes above ^
 */

// reading commands file
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
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// reading events file
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

client.login(DISCORD_BOT_TOKEN)
  .then(() => {
    global.discordClient = client;
    console.log('Discord client is ready and set globally.');
  })
  .catch(console.error);

// Use JSON middleware with rawBody capture for signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    }
  })
);

// Define the route for Unthread webhooks using the new webhook handler
app.post('/webhook/unthread', webhookHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});