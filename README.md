# Unthread Discord Bot 🤖

[![made by](https://img.shields.io/badge/made%20by-WG%20Tech%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![official](https://img.shields.io/badge/official-Unthread%20Extension-FF5241.svg?logo=discord&logoColor=white&labelColor=181717&style=flat-square)](https://unthread.com) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs)

[![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-discord-bot)

[![release workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-discord-bot/release.yml?style=flat-square&logo=github&label=release&labelColor=181717)](https://github.com/wgtechlabs/unthread-discord-bot/actions/workflows/release.yml) [![build workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-discord-bot/build.yml?branch=dev&style=flat-square&logo=github&labelColor=181717&label=build)](https://github.com/wgtechlabs/unthread-discord-bot/actions/workflows/build.yml) [![version](https://img.shields.io/github/release/wgtechlabs/unthread-discord-bot.svg?logo=github&labelColor=181717&color=default&style=flat-square&label=version)](https://github.com/wgtechlabs/unthread-discord-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/blob/main/LICENSE)

The Unthread Discord Bot connects your Discord server to Unthread so your community can open and manage support tickets without leaving Discord.

## What it does

- Lets users open tickets with `/support`
- Turns new posts in selected Discord forum channels into tickets automatically
- Creates a Discord thread for each ticket so the conversation stays organized
- Syncs replies and updates between Discord and Unthread through Redis-backed webhooks
- Includes simple utility commands for health and version checks

## How it works

1. A user opens a ticket with `/support` or creates a forum post in a configured forum channel.
2. The bot creates the ticket in Unthread.
3. The conversation is kept in sync between Discord and Unthread.
4. A separate `webhook-server` service receives Unthread webhooks and places them on Redis.
5. This bot reads those Redis events and updates Discord.

## Requirements

Before you deploy the bot, make sure you have:

- A Discord application and bot token
- A Discord server where you can install the bot
- An Unthread API key and Slack channel ID
- PostgreSQL
- Two Redis connections:
  - one for bot state and cache
  - one for webhook queue processing
- Node.js `>=20.19.0` if you want to run it without Docker
- `pnpm@9.15.9` via Corepack for local development

## Quick start

### Option 1: Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/nVHIjj?referralCode=dTwT-i)

This is the easiest option if you want a hosted setup.

### Option 2: Run with Docker Compose

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in the required values in `.env`.
3. Start the full stack:

   ```bash
   docker-compose up -d
   ```

4. Check the logs if needed:

   ```bash
   docker-compose logs -f server
   docker-compose logs -f webhook-server
   ```

5. Deploy slash commands once your bot token and guild ID are ready:

   ```bash
   docker-compose exec server node dist/deploy_commands.js
   ```

### Option 3: Run locally with pnpm

1. Install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

2. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

4. Start the bot:

   ```bash
   pnpm start
   ```

   `pnpm start` builds the project, deploys slash commands, and starts the bot.

5. If you only want to deploy or force redeploy slash commands:

   ```bash
   pnpm deploycommand
   ```

For local development with auto-reload, use:

```bash
pnpm dev
```

## Discord setup

### 1. Create the Discord app

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Add a bot user.
4. Enable the **Message Content Intent** in the bot settings.

### 2. Invite the bot to your server

Grant these permissions when you invite the bot:

- View Channels
- Send Messages
- Send Messages in Threads
- Read Message History
- Create Public Threads
- Create Private Threads
- Manage Threads
- Embed Links
- Use Slash Commands

Invite URL format:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1084479760448&integration_type=0&scope=bot+applications.commands
```

### 3. Get your guild ID

1. Enable **Developer Mode** in Discord.
2. Right-click your server.
3. Select **Copy ID**.
4. Put that value in `GUILD_ID`.

## Environment variables

Copy `.env.example` to `.env` and set these values.

### Required for the bot

| Variable | What it is for |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application ID |
| `GUILD_ID` | Discord server ID used for slash command deployment |
| `UNTHREAD_API_KEY` | Unthread API authentication |
| `UNTHREAD_SLACK_CHANNEL_ID` | Slack channel used by Unthread when creating conversations |
| `SLACK_TEAM_ID` | Slack workspace ID; current startup validation expects it |
| `POSTGRES_URL` | PostgreSQL connection string |
| `PLATFORM_REDIS_URL` | Redis connection for bot cache and state |
| `WEBHOOK_REDIS_URL` | Redis connection for webhook queue polling |

### Required when you run the included webhook server

| Variable | What it is for |
| --- | --- |
| `UNTHREAD_WEBHOOK_SECRET` | Secret used by the webhook server for Unthread webhook validation |

### Optional

| Variable | What it is for |
| --- | --- |
| `FORUM_CHANNEL_IDS` | Comma-separated Discord forum channel IDs for automatic ticket creation |
| `NODE_ENV` | Use `development` for verbose logs; default behavior is production-safe |
| `PORT` | Port used by the separate webhook server; default `3000` |
| `UNTHREAD_HTTP_TIMEOUT_MS` | Timeout for Unthread API requests; default `10000` |
| `WEBHOOK_POLL_INTERVAL` | Redis polling interval in milliseconds; default `5000` |
| `DATABASE_SSL_VALIDATE` | PostgreSQL SSL behavior |
| `DATABASE_SSL_CA` | Optional CA certificate value for PostgreSQL SSL |
| `DUMMY_EMAIL_DOMAIN` | Fallback email domain for Discord users without an email |

## Commands available in Discord

### Ticket command

- `/support` opens a modal with:
  - Ticket title
  - Summary
  - Optional contact email

Important behavior:

- `/support` only works in normal server channels
- `/support` does not work inside threads
- `/support` does not work in channels listed in `FORUM_CHANNEL_IDS`
- If a user leaves the email blank, the bot falls back to an existing customer email or a generated `@discord.invalid` email

### Utility commands

- `/ping` shows API latency and WebSocket heartbeat
- `/server` shows server information
- `/user` shows user information
- `/version` shows the running bot version

## Forum channel support

If you want forum posts to become tickets automatically:

1. Add forum channel IDs to `FORUM_CHANNEL_IDS`.
2. Make sure those IDs belong to real **forum channels**.
3. Create a new forum post in one of those channels.

The bot will:

- validate that the parent channel is really a forum channel
- create a ticket in Unthread
- bind that Discord thread to the ticket
- post a confirmation embed in the thread

## Local stack overview

The included `docker-compose.yml` starts these services:

- `server` - the Discord bot
- `webhook-server` - receives Unthread webhooks and writes them to Redis
- `postgres-platform` - PostgreSQL storage
- `redis-platform` - Redis for bot state and cache
- `redis-webhook` - Redis for webhook queue messages

## Webhook configuration

The bot itself does not expose an HTTP webhook endpoint.

Instead:

- `webhook-server` receives Unthread webhook traffic
- both services must connect to the same Redis instance for webhook syncing to work
- `webhook-server` writes events to Redis using `REDIS_URL`
- the Discord bot reads those events using `WEBHOOK_REDIS_URL`
- outside `docker-compose`, point `REDIS_URL` and `WEBHOOK_REDIS_URL` at the same Redis instance

If you are testing locally, expose the webhook server and point Unthread to:

```text
https://YOUR_PUBLIC_URL/webhook/unthread
```

You can use tools such as VS Code port forwarding or ngrok to make the local webhook server reachable from the internet.

## Troubleshooting

### Slash commands do not appear

- Make sure `CLIENT_ID`, `GUILD_ID`, and `DISCORD_BOT_TOKEN` are correct
- Run `pnpm deploycommand` again
- Guild commands update quickly; command changes still need redeployment

### `/support` fails

- Make sure you are using it in a normal text channel, not inside a thread
- Make sure the bot has permission to create and manage threads in that channel
- Do not use `/support` inside a configured forum channel

### Forum posts are not creating tickets

- Check that `FORUM_CHANNEL_IDS` only contains forum channel IDs
- Check the bot permissions in both the forum channel and the created thread
- Set `NODE_ENV=development` if you want more detailed logs

### Webhook sync is not working

- Make sure `webhook-server` is running
- Make sure `WEBHOOK_REDIS_URL` points to the Redis instance used by the webhook server
- Make sure the public webhook URL in Unthread points to `/webhook/unthread`
- Check both `server` and `webhook-server` logs

### Database or Redis connection errors

- Check `POSTGRES_URL`, `PLATFORM_REDIS_URL`, and `WEBHOOK_REDIS_URL`
- Make sure PostgreSQL and both Redis instances are reachable before starting the bot
- Review `DATABASE_SSL_VALIDATE` if you are connecting to a managed PostgreSQL service

## Useful commands for contributors

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:coverage
pnpm test:integration
pnpm cmd:deploy
pnpm cmd:reset
pnpm docker:build
pnpm docker:run
pnpm sbom:generate
```

## Help and support

- Start with the [GitHub Discussions help category](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/help-support)
- Search [existing issues](https://github.com/wgtechlabs/unthread-discord-bot/issues)
- Read the [security policy](./SECURITY.md) for private security reports

## Contributing

Pull requests are welcome. Please target the `dev` branch.

- Read the [contributing guide](./CONTRIBUTING.md)
- Follow the [code of conduct](./CODE_OF_CONDUCT.md)

## Sponsor

Like this project? Leave a star and consider supporting the maintainer:

- [Become a sponsor](https://github.com/sponsors/wgtechlabs)
- [Buy me a coffee](https://buymeacoffee.com/wgtechlabs)
- Use the [Railway template](https://railway.com/template/nVHIjj?referralCode=dTwT-i)

## License

Licensed under the [GNU Affero General Public License v3.0](./LICENSE).

## Author

Created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with help from [contributors](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/unthread-discord-bot)](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors)

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
