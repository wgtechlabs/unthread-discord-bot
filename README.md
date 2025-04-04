# Unthread Discord Bot 🤖

[![made by](https://img.shields.io/badge/made%20by-WG%20Technology%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![release](https://img.shields.io/github/release/wgtechlabs/unthread-discord-bot.svg?logo=github&labelColor=181717&color=green&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-discord-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-discord-bot/blob/main/license)

<!-- [![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-discord-bot) -->

The Unthread Discord Bot is an official community project for Unthread, designed to streamline support ticket creation and management within Discord servers. By using simple commands, users can easily create support tickets, which are then managed through the Unthread platform. This bot integrates seamlessly with Discord and Unthread, providing a smooth and efficient support experience for both users and administrators.

## ✨ Key Features

- Create support tickets using the `/support` command.
- Automatically create support tickets from posts in specific forum channels.
- Easy setup and configuration through the Discord Developer Portal.
- Integration with Unthread for advanced ticket management.
- Customizable environment settings for personalized bot behavior.

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

## 🎯 Contributing

Contributions are welcome, create a pull request to this repo and I will review your code. Please consider to submit your pull request to the `dev` branch. Thank you!

Read the project's [contributing guide](./contributing.md) for more info.

## 🐛 Issues

Please report any issues and bugs by [creating a new issue here](https://github.com/wgtechlabs/unthread-discord-bot/issues/new/choose), also make sure you're reporting an issue that doesn't exist. Any help to improve the project would be appreciated. Thanks! 🙏✨

## 🙏 Support

Like this project? **Leave a star**! ⭐⭐⭐⭐⭐

There are several ways you can support this project:

- [Become a sponsor](https://github.com/sponsors/warengonzaga) and get some perks! 💖
- [Buy me a coffee](https://buymeacoffee.com/warengonzaga) if you just love what I do! ☕
- Deploy using the [Railway Template](https://railway.com/template/nVHIjj?referralCode=dTwT-i) which directly supports the ongoing development! ✨

Recognized my open-source contributions? [Nominate me](https://stars.github.com/nominate) as GitHub Star! 💫

## 📋 Code of Conduct

We're committed to providing a welcoming and inclusive environment for all contributors and users. Please review our project's [Code of Conduct](./code_of_conduct.md) to understand our community standards and expectations for participation.

## 📃 License

This project is licensed under the [GNU Affero General Public License v3.0](https://opensource.org/licenses/AGPL-3.0). This license requires that all modifications to the code must be shared under the same license, especially when the software is used over a network. See the [LICENSE](LICENSE) file for the full license text.

## 📝 Author

This project is created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with the help of awesome [contributors](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/unthread-discord-bot)](https://github.com/wgtechlabs/unthread-discord-bot/graphs/contributors)

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com), [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
