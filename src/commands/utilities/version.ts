import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { version } from '../../../package.json';
import { getBotFooter } from '../../utils/botUtils';

/**
 * Version Command
 *
 * Provides information about the current bot version to users.
 * Fetches version information from the package.json file and displays it in an embedded message.
 *
 * 🎯 FOR CONTRIBUTORS:
 * ===================
 * This command demonstrates how to import and use package.json data in commands.
 * It's useful for support and debugging scenarios where version information is needed.
 *
 * 🔧 IMPLEMENTATION NOTES:
 * =======================
 * - Version is imported directly from package.json at compile time
 * - Uses the bot's footer utility for consistent branding
 * - Simple embed structure for clean presentation
 *
 * 💡 MAINTENANCE TIPS:
 * ===================
 * - Version updates automatically when package.json version changes
 * - No manual version string updates needed
 * - Command is useful for verifying deployments and troubleshooting
 *
 * @module commands/utilities/version
 */
export const data = new SlashCommandBuilder()
	.setName('version')
	.setDescription('Displays the current bot version.');

/**
 * Executes the version command.
 *
 * @param interaction - The interaction object from Discord.js
 * @throws {Error} When interaction reply fails
 *
 * Implementation Details:
 * - Retrieves version information from package.json
 * - Creates an embedded message with the bot version
 * - Replies to the interaction with the formatted embed
 *
 * @example
 * ```typescript
 * // Command usage in Discord: /version
 * // Response: Embedded message showing current bot version
 * ```
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	const embed = new EmbedBuilder()
		.setColor(0xEB1A1A)
		.setTitle('Bot Version')
		.setDescription(`Current version: v${version}`)
		.setFooter({ text: getBotFooter() })
		.setTimestamp();

	await interaction.reply({ embeds: [embed], ephemeral: true });
}