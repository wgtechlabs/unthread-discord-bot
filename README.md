# Unthread Discord Bot 🤖 - Official Integration 

[![made by](https://img.shields.io/badge/made%20by-WG%20Technology%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![release](https://img.shields.io/github/release/wgtechlabs/unthread-discord-bot.svg?logo=github&labelColor=181717&color=green&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/blob/main/license)

<!-- [![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-discord-bot) -->

The Unthread Discord Bot seamlessly connects your Discord community with Unthread's powerful ticket management system. This official integration transforms how you handle support requests by enabling users to create and manage tickets directly within Discord.

With simple commands and forum integration, support tickets automatically sync between both platforms, streamlining your workflow and improving response times. Whether you're managing a gaming community, running a business server, or supporting an open-source project, this bot provides the tools you need for efficient, organized customer support.

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
- **Customizable Configuration**: Tailor the bot's behavior to your community's specific support needs
- **Webhook Notifications**: Receive instant updates when ticket statuses change or new replies are added
- **User-friendly Interface**: Simple commands and clear notifications enhance the support experience for everyone

## 📥 Easy Deployment

You can use Railway to deploy this bot with just one click. Railway offers a seamless deployment experience without any configuration hassles.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/nVHIjj?referralCode=dTwT-i)
> [!TIP]
> When you deploy using the Railway button above, you're directly supporting the ongoing development and maintenance of this project. Your support helps keep this bot free and continuously improving with new features. Thank you for your contribution! 🙏✨

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

## 📦 Manual Installation

> [!WARNING]
> This is an advanced installation method and is not recommended for beginners. If you're new to Discord bot development, consider using the [Railway deployment method](#-easy-deployment) instead.

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
3. Under "BOT PERMISSIONS", select the necessary permissions for your bot.
4. Use the following link to invite your bot to your server. Replace `YOUR_BOT_CLIENT_ID` with your actual bot client ID: <https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=1084479760448&integration_type=0&scope=bot+applications.commands>

### 4. Fill Out the Environment Files

1. Create a `.env` file in the root directory of your project.
2. Copy the contents of `.env.example` to `.env`.
3. Fill in the required information:
   - `DISCORD_BOT_TOKEN`: The token you copied from the "Bot" tab.
   - `CLIENT_ID`: Your application's client ID, found in the "General Information" tab.
   - `GUILD_ID`: The ID of the Discord server where you want to deploy the bot. [How to Get Your Discord Server ID](#how-to-get-your-discord-server-id)
   - `UNTHREAD_API_KEY`: Your Unthread API key.
   - `UNTHREAD_TRIAGE_CHANNEL_ID`: Your Unthread triage channel ID.
   - `UNTHREAD_EMAIL_INBOX_ID`: Your Unthread email inbox ID.
   - `UNTHREAD_WEBHOOK_SECRET`: Your Unthread webhook secret.

### 5. Install and Run the Project Locally

1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
  ```sh
  yarn install
  ```
3. Start the bot:
  ```sh
  yarn start
  ```
4. The bot should now be running in your Discord server.

### 6. Port Forwarding for Webhook

1. Open your project in VS Code.
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on Mac).
3. Type `Ports: Focus on Ports View` and select it.
4. In the Ports view, click on the `+` icon to add a new port.
5. Enter `3000` as the port number and press Enter.
6. Click on the globe icon next to the port to make it publicly accessible.

### 7. Configure Webhook in Unthread Dashboard

1. Log in to your Unthread dashboard.
2. Navigate to the "Settings" section.
3. Under "Webhook Configuration", enter the following URL:
  ```
  http://<YOUR_PUBLIC_URL>:3000/webhook/unthread
  ```
    Replace `<YOUR_PUBLIC_URL>` with the public URL provided by VS Code.
4. Save the settings.

Your bot should now be able to receive events from Unthread.

### 8. Configure Forum Channels

To enable automatic ticket creation from forum posts:

1. Add forum channel IDs to your `.env` file:
   ```
   FORUM_CHANNEL_IDS=123456789012345678,234567890123456789
   ```
2. Each comma-separated ID represents a forum channel that will be monitored.
3. Any new forum posts in these channels will automatically create a corresponding ticket in Unthread.
4. Replies in the forum post will be synchronized with the Unthread ticket.

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
