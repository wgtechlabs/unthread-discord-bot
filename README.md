# Unthread Discord Bot 🤖 - Official Integration

[![made by](https://img.shields.io/badge/made%20by-WG%20Technology%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![release](https://img.shields.io/github/release/wgtechlabs/unthread-discord-bot.svg?logo=github&labelColor=181717&color=green&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/blob/main/license)

[![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-discord-bot)

The Unthread Discord Bot seamlessly connects your Discord community with Unthread's powerful ticket management system. This official integration transforms how you handle support requests by enabling users to create and manage tickets directly within Discord.

With simple commands and forum integration, support tickets automatically sync between both platforms, streamlining your workflow and improving response times. Whether you're managing a gaming community, running a business server, or supporting an open-source project, this bot provides the tools you need for efficient, organized customer support.

## 🤗 Special Thanks

<!-- markdownlint-disable MD033 -->
| <div align="center">💎 Platinum Sponsor</div> |
|:-------------------------------------------:|
| <a href="https://unthread.com"><img src="https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/sponsors/platinum_unthread.png" width="250" alt="Unthread"></a> |
| <div align="center"><a href="https://unthread.com" target="_blank"><b>Unthread</b></a><br/>Streamlined support ticketing for modern teams.</div> |
<!-- markdownlint-enable MD033 -->

## 🤔 How It Works

1. Users create tickets via the `/support` command or by posting in configured forum channels
2. The bot instantly creates a corresponding ticket in your Unthread dashboard
3. All replies and updates sync in real-time between Discord and Unthread
4. Support staff can manage tickets from either platform seamlessly

Ready to transform your Discord support experience? Get started in minutes with our [one-click deployment](#-easy-deployment)!

## ✨ Key Features

- **Seamless Ticket Creation**: Create support tickets with the intuitive `/support` command or through configured forum channels
- **Effortless Integration**: Connect your Discord server to Unthread's powerful ticket management system in minutes
- **Real-time Synchronization**: All ticket updates and responses automatically sync between Discord and Unthread
- **Forum Channel Support**: Transform any forum post into a fully-managed support ticket without extra steps
- **Advanced Caching**: Redis-powered caching system for improved performance and reliability
- **Permission Validation**: Intelligent permission checking to prevent conflicts and ensure proper functionality
- **Thread-based Management**: Each ticket creates a dedicated thread for organized communication
- **Webhook Notifications**: Receive instant updates when ticket statuses change or new replies are added
- **User-friendly Interface**: Simple commands and clear notifications enhance the support experience for everyone
- **Debug Mode**: Comprehensive logging system for development and troubleshooting
- **Retry Mechanism**: Built-in retry logic for handling API failures and network issues
- **Customer Management**: Automatic customer profile creation and management integration

## 📥 Easy Deployment

### 🚀 One-Click Railway Deployment

You can use Railway to deploy this bot with just one click. Railway offers a seamless deployment experience without any configuration hassles.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/nVHIjj?referralCode=dTwT-i)
> [!TIP]
> When you deploy using the Railway button above, you're directly supporting the ongoing development and maintenance of this project. Your support helps keep this bot free and continuously improving with new features. Thank you for your contribution! 🙏✨

### 🐳 Docker Deployment

The bot is also available as pre-built Docker images with multi-architecture support (linux/amd64, linux/arm64):

**Docker Hub Images:**
```bash
# Latest stable release
docker pull wgtechlabs/unthread-discord-bot:latest

# Specific version
docker pull wgtechlabs/unthread-discord-bot:1.0.0

# Development build (from dev branch)
docker pull wgtechlabs/unthread-discord-bot:dev
```

**GitHub Container Registry:**
```bash
# Latest stable release
docker pull ghcr.io/wgtechlabs/unthread-discord-bot:latest

# Specific version (with v prefix)
docker pull ghcr.io/wgtechlabs/unthread-discord-bot:v1.0.0

# Development build
docker pull ghcr.io/wgtechlabs/unthread-discord-bot:dev
```

**Quick start with Docker:**
```bash
# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Run with Docker
docker run --env-file .env wgtechlabs/unthread-discord-bot:latest

# Or with Docker Compose
docker-compose up -d
```

### 🛡️ Security & Supply Chain

All Docker images include comprehensive security features:

- **SBOM Generation**: Software Bill of Materials for transparency
- **Vulnerability Scanning**: Automated security scanning with Trivy
- **Supply Chain Attestations**: Build provenance and authenticity verification
- **Multi-stage Builds**: Minimal runtime images with security best practices
- **Non-root Execution**: Containers run as unprivileged `nodejs` user

**Generate SBOM locally:**
```bash
# For contributors and security analysis
./scripts/generate-sbom.sh unthread-discord-bot:latest
```

<!-- ## 😎 Demo

[![demo](https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/demo.gif)](https://github.com/wgtechlabs/unthread-discord-bot) -->

## 🕹️ Usage

### Creating a Support Ticket

1. **Using the `/support` Command:**
   - Type `/support` in any text channel where the bot has access.
   - A modal will appear with fields for:
     - Ticket Title: A brief description of your issue
     - Summary: Detailed explanation of your problem
     - Contact Email (Optional): Your email address for notifications

2. **Using Forum Channels:**
   - Create a new post in any forum channel that has been configured for ticket creation.
   - Your post will automatically be converted to a support ticket.
   - A confirmation message will appear in the thread.

### Managing Tickets

- **Replying to Tickets:**
  - Simply reply in the private thread or forum post created by the bot.
  - Your messages will be synced with the Unthread system.

- **Viewing Ticket Status:**
  - Status updates (open/closed) will be posted in the thread automatically.

### Utility Commands

- `/ping` - Shows bot latency and API ping metrics.
- `/server` - Provides information about the Discord server.
- `/user` - Shows details about your user account.
- `/version` - Displays the current bot version.

## 🏗️ Architecture

This bot is built with **TypeScript** for enhanced maintainability, type safety, and developer experience. The codebase follows clean coding principles and implements a modern **3-layer data persistence architecture** for optimal performance and reliability.

### 🚀 New 3-Layer Storage Architecture

**Layer 1 (L1): In-Memory Cache**
- Ultra-fast access for frequently used data
- LRU eviction policy to manage memory efficiently
- Automatic cache warming from lower layers

**Layer 2 (L2): Redis Cache**
- Distributed cache for persistence across restarts
- Fast lookup with millisecond response times
- Shared between application instances

**Layer 3 (L3): PostgreSQL Database**
- Primary source of truth for all data
- ACID compliance and data integrity
- Complex queries and reporting capabilities

### Technology Stack

- **TypeScript**: For type safety and better code maintainability
- **Discord.js v14**: Modern Discord API interactions
- **Express.js**: RESTful API server with comprehensive monitoring
- **Node.js 18+**: Runtime environment
- **Yarn with PnP**: Package management and dependency resolution
- **ESLint**: Code quality and consistent formatting

**Storage & Performance:**
- **PostgreSQL**: Primary database with full ACID compliance
- **Redis**: High-performance L2 cache and queue management
- **BullMQ**: Robust job queue system for webhook processing
- **IORedis**: High-performance Redis client with cluster support

**Infrastructure:**
- **Docker Compose**: Complete local development environment
- **Health Monitoring**: Comprehensive health checks and metrics
- **Queue Processing**: Async webhook handling with retry logic

### Build System

The project uses TypeScript compilation with Yarn SDK integration:

```bash
# Development with live reload
yarn dev

# Build for production
yarn build

# Deploy commands only
yarn deploycommand

# Production start
yarn start

# Linting
yarn lint
yarn lint:fix
```

### 🐳 Docker Development Commands

The project includes dedicated Docker scripts for local development and security testing:

```bash
# Build Docker image locally
yarn docker:build

# Build with enhanced security (no cache)
yarn docker:build:secure

# Build with SBOM and provenance generation
yarn docker:build:sbom

# Run the Docker container
yarn docker:run

# Generate SBOM for security analysis
yarn sbom:generate
```

### 🚀 CI/CD Pipeline

The project features a comprehensive CI/CD pipeline with GitHub Actions that automatically:

**Development Builds (on `dev` branch):**
- Builds multi-architecture Docker images (linux/amd64, linux/arm64)
- Publishes to Docker Hub and GitHub Container Registry with `dev` tags
- Generates Software Bill of Materials (SBOM)
- Performs vulnerability scanning with Trivy
- Creates build attestations for supply chain security

**Production Releases (on release tags):**
- Builds and publishes versioned Docker images with semantic versioning
- Creates multiple tag variants (latest, major, minor, patch)
- Enhanced security scanning and reporting
- Comprehensive release summaries with deployment instructions

**Security Features:**
- SBOM generation for transparency
- Supply chain attestations
- Vulnerability scanning results in GitHub Security tab
- Non-root container execution

### 🐳 Local Development with Docker

For the complete development experience with all dependencies:

```bash
# Start all services (PostgreSQL, Redis, Bot)
docker-compose up -d

# View logs
docker-compose logs -f discord-bot

# Stop all services
docker-compose down

# Reset all data
docker-compose down -v
```

### 📊 Monitoring & Health Checks

The bot provides comprehensive monitoring endpoints:

- **GET /health** - Overall system health (Discord + Storage layers)
- **GET /webhook/health** - Queue system health and metrics
- **GET /webhook/metrics** - Detailed processing statistics
- **POST /webhook/retry** - Manual retry of failed webhook jobs

Example health check response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "discord": "connected",
    "storage": "healthy",
    "storage_layers": {
      "memory": true,
      "redis": true,
      "postgres": true
    }
  }
}
```

## 📦 Manual Installation

> [!WARNING]
> This is an advanced installation method and is not recommended for beginners. If you're new to Discord bot development, consider using the [Railway deployment method](#-easy-deployment) instead.

### Prerequisites

- **Node.js**: Version 18.16.0 or higher
- **Yarn**: Version 4.9.4 (required for proper dependency management)
- **TypeScript**: Automatically managed via Yarn SDK
- **Discord Application**: Bot token and proper permissions
- **Unthread Account**: API access and configuration

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click on the "New Application" button.
3. Give your application a name and click "Create".

### 2. Setup Application Bot

1. In your newly created application, navigate to the "Bot" tab.
2. Click on the "Add Bot" button and confirm by clicking "Yes, do it!".
3. Under the "TOKEN" section, click "Copy" to copy your bot token. You will need this later.
4. Under "Privileged Gateway Intents", enable the "Message Content Intent".

### 3. Add the Bot to Your Discord Server

1. Navigate to the "OAuth2" tab and then to the "URL Generator" sub-tab.
2. Under "SCOPES", select `bot` and `applications.commands`.
3. Under "BOT PERMISSIONS", select the following required permissions:
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Create Private Threads
   - Manage Threads
   - Embed Links
   - Read Message History
   - Use Slash Commands
   - View Channels

4. Use the generated URL to invite your bot to your server, or use this pre-configured link (replace `YOUR_BOT_CLIENT_ID` with your actual bot client ID):

   ```url
   https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=1084479760448&integration_type=0&scope=bot+applications.commands
   ```

> **Note**: The bot requires these specific permissions to create and manage threads for ticket handling. Missing permissions may cause functionality issues.

### 4. Setup Storage Dependencies

**For Docker Compose (Recommended):**
```bash
# Use the provided Docker Compose configuration
docker-compose up -d postgres redis-cache redis-queue
```

**For Manual Setup:**
- **PostgreSQL 16+**: Required for L3 persistent storage
- **Redis 7+**: Required for L2 cache and queue processing

### 5. Fill Out the Environment Files

1. Create a `.env` file in the root directory of your project.
2. Copy the contents of `.env.example` to `.env`.
3. Fill in the required information:

**Discord Configuration:**
   - `DISCORD_BOT_TOKEN`: The token you copied from the "Bot" tab.
   - `CLIENT_ID`: Your application's client ID, found in the "General Information" tab.
   - `GUILD_ID`: The ID of the Discord server where you want to deploy the bot. [How to Get Your Discord Server ID](#how-to-get-your-discord-server-id)

**Unthread Configuration:**
   - `UNTHREAD_API_KEY`: Your Unthread API key.
   - `UNTHREAD_SLACK_CHANNEL_ID`: Your Unthread Slack channel ID for ticket routing.

**Storage Configuration (3-Layer Architecture):**
   - `POSTGRES_URL`: PostgreSQL connection string (e.g., `postgres://user:password@localhost:5432/database`)
   - `PLATFORM_REDIS_URL`: Redis cache connection URL (e.g., `redis://localhost:6379`)
   - `WEBHOOK_REDIS_URL`: Redis queue connection URL (e.g., `redis://localhost:6380`)

**Optional Configuration:**
   - `FORUM_CHANNEL_IDS`: Comma-separated list of forum channel IDs for automatic ticket creation.
   - `DEBUG_MODE`: Set to `true` for verbose logging during development (default: `false`).
   - `PORT`: Port for the webhook server (default: `3000`).

### 6. Install and Run the Project Locally

1. Clone the repository and navigate to the project directory:

   ```bash
   git clone https://github.com/wgtechlabs/unthread-discord-bot.git
   cd unthread-discord-bot
   ```

2. Enable Corepack and install dependencies:

   ```bash
   corepack enable
   yarn install
   ```

   > **Note**: This project uses Yarn 4.9.4 with Plug'n'Play for efficient dependency management. Corepack ensures you're using the correct Yarn version.

3. Build the TypeScript project:

   ```bash
   yarn build
   ```

4. Deploy the slash commands to your Discord server:

   ```bash
   yarn deploycommand
   ```

5. Start the bot in production mode:

   ```bash
   yarn start
   ```

   Or for development with TypeScript compilation and auto-restart:

   ```bash
   yarn dev
   ```

6. The bot should now be running in your Discord server and the webhook server will be listening on the specified port.

### Development Workflow

For active development, use these commands:

```bash
# Development with live reload (TypeScript)
yarn dev

# Type checking and linting
yarn lint
yarn lint:fix

# Build only (creates dist/ folder)
yarn build

# Deploy commands only (development mode)
yarn deploycommand:dev
```

### How to Get Your Discord Server ID

1. Open Discord and go to your server.
2. Click on the server name at the top of the channel list to open the dropdown menu.
3. Select "Server Settings".
4. In the "Server Settings" menu, go to the "Widget" tab.
5. Enable the "Server Widget" option if it is not already enabled.
6. The "Server ID" will be displayed under the "Widget" settings.

Alternatively, you can enable Developer Mode to get the server ID:

1. Go to your Discord user settings.
2. Navigate to the "Advanced" tab under "App Settings".
3. Enable "Developer Mode".
4. Right-click on your server name in the server list.
5. Select "Copy ID" to copy the server ID to your clipboard.

## 🌐 Webhook Configuration (Development)

For local development, you'll need to expose your webhook endpoint to receive events from Unthread:

### Option 1: Using VS Code Port Forwarding (Recommended)

1. Open your project in VS Code.
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on Mac).
3. Type `Ports: Focus on Ports View` and select it.
4. In the Ports view, click on the `+` icon to add a new port.
5. Enter `3000` (or your configured PORT) as the port number and press Enter.
6. Click on the globe icon next to the port to make it publicly accessible.
7. Copy the generated public URL for use in the Unthread webhook configuration.

### Option 2: Using ngrok (Alternative)

1. Install ngrok: [https://ngrok.com/download](https://ngrok.com/download)
2. Run ngrok to expose your local port:

   ```bash
   ngrok http 3000
   ```

3. Copy the generated HTTPS URL for use in the Unthread webhook configuration.

### Configure Webhook in Unthread Dashboard

1. Log in to your Unthread dashboard.
2. Navigate to the "Settings" or "Integrations" section.
3. Under "Webhook Configuration", enter the following URL: `https://<YOUR_PUBLIC_URL>/webhook/unthread`
   - Replace `<YOUR_PUBLIC_URL>` with the public URL from your port forwarding setup
   - For production: Use your actual server domain (e.g., `https://your-bot-server.com/webhook/unthread`)
4. Configure the webhook to send events to the unthread-webhook-server, which will queue them for the bot.
5. Save the settings.

**Note:** The Discord bot now receives events through a Redis queue from the unthread-webhook-server, similar to the Telegram bot architecture. Direct webhook signature validation has been removed.

### Configure Forum Channels (Optional)

To enable automatic ticket creation from forum posts:

1. Add forum channel IDs to your `.env` file:

   ```env
   FORUM_CHANNEL_IDS=123456789012345678,234567890123456789
   ```

   - Replace the IDs with the actual IDs of your forum channels.
   - You can find the channel ID by right-clicking on the channel name in Discord and selecting "Copy ID" (make sure Developer Mode is enabled in your Discord settings).

2. Each comma-separated ID represents a forum channel that will be monitored for new posts.
3. Any new forum posts in these channels will automatically create a corresponding ticket in Unthread.
4. Replies in the forum post will be synchronized with the Unthread ticket.
5. The bot includes validation to ensure only actual forum channels are processed, preventing conflicts with text channels.

> **Important**: Only add actual forum channel IDs to this list. The bot will validate channel types to prevent issues.

## 💬 Community Discussions

Join our community discussions to get help, share ideas, and connect with other users:

- 📣 **[Announcements](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/announcements)**: Official updates from the maintainer
- 📸 **[Showcase](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/showcase)**: Show and tell your implementation
- 💖 **[Wall of Love](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/wall-of-love)**: Share your experience with the bot
- 🛟 **[Help & Support](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/help-support)**: Get assistance from the community
- 🧠 **[Ideas](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/ideas)**: Suggest new features and improvements

## 🛟 Help & Support

### Getting Help

Need assistance with the bot? Here's how to get help:

- **Community Support**: Check the [Help & Support](https://github.com/wgtechlabs/unthread-discord-bot/discussions/categories/help-support) category in our GitHub Discussions for answers to common questions.
- **Ask a Question**: Create a [new discussion](https://github.com/wgtechlabs/unthread-discord-bot/discussions/new?category=help-support) if you can't find answers to your specific issue.
- **Documentation**: Review the [usage instructions](#%EF%B8%8F-usage) in this README for common commands and features.
- **Known Issues**: Browse [existing issues](https://github.com/wgtechlabs/unthread-discord-bot/issues) to see if your problem has already been reported.

### Common Troubleshooting

**Bot not responding to commands:**

- Ensure the bot has the required permissions in your server
- Check if the bot is online in your Discord server
- Verify that slash commands are deployed with `yarn deploycommand`

**Forum channel tickets not creating:**

- Confirm the channel IDs in `FORUM_CHANNEL_IDS` are actual forum channels (not text channels)
- Enable Debug Mode (`DEBUG_MODE=true`) to see detailed logs
- Check bot permissions in the specific forum channels

**Webhook issues:**

- Verify the webhook URL is accessible from the internet
- Ensure events are being queued properly in the Redis webhook queue
- Check the unthread-webhook-server is processing and queuing events correctly
- Ensure the Express server is running on the correct port

**Redis connection problems:**

- Verify your `REDIS_URL` is correctly formatted
- Test Redis connectivity independently
- Redis is now required for application functionality and data persistence

### Reporting Issues

Please report any issues, bugs, or improvement suggestions by [creating a new issue](https://github.com/wgtechlabs/unthread-discord-bot/issues/new/choose). Before submitting, please check if a similar issue already exists to avoid duplicates.

### Security Vulnerabilities

For security vulnerabilities, please do not report them publicly. Follow the guidelines in our [security policy](./security.md) to responsibly disclose security issues.

Your contributions to improving this project are greatly appreciated! 🙏✨

## 🎯 Contributing

Contributions are welcome, create a pull request to this repo and I will review your code. Please consider to submit your pull request to the `dev` branch. Thank you!

Read the project's [contributing guide](./contributing.md) for more info.

## 🙏 Sponsor

Like this project? **Leave a star**! ⭐⭐⭐⭐⭐

There are several ways you can support this project:

- [Become a sponsor](https://github.com/sponsors/wgtechlabs) and get some perks! 💖
- [Buy me a coffee](https://buymeacoffee.com/wgtechlabs) if you just love what I do! ☕
- Deploy using the [Railway Template](https://railway.com/template/nVHIjj?referralCode=dTwT-i) which directly supports the ongoing development! 🛠️

## ⭐ GitHub Star Nomination

Found this project helpful? Consider nominating me **(@warengonzaga)** for the [GitHub Star program](https://stars.github.com/nominate/)! This recognition supports ongoing development of this project and [my other open-source projects](https://github.com/warengonzaga?tab=repositories). GitHub Stars are recognized for their significant contributions to the developer community - your nomination makes a difference and encourages continued innovation!

## 📋 Code of Conduct

I'm committed to providing a welcoming and inclusive environment for all contributors and users. Please review the project's [Code of Conduct](./code_of_conduct.md) to understand the community standards and expectations for participation.

## 📃 License

This project is licensed under the [GNU Affero General Public License v3.0](https://opensource.org/licenses/AGPL-3.0). This license requires that all modifications to the code must be shared under the same license, especially when the software is used over a network. See the [LICENSE](LICENSE) file for the full license text.

## 📝 Author

This project is created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with the help of awesome [contributors](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/unthread-discord-bot)](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors)

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
