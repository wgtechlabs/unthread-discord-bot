import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';
import { version } from '../../../package.json';

/**
 * Version Command
 * 
 * Provides information about the current bot version to users.
 * Fetches version information from the package.json file and displays it in an embedded message.
 * 
 * @module commands/utilities/version
 */
export const data = new SlashCommandBuilder()
    .setName('version')
    .setDescription('Displays the current bot version.');

/**
 * Executes the version command.
 * 
 * @async
 * @param {CommandInteraction} interaction - The interaction object from Discord.js.
 * @returns {Promise<void>}
 * 
 * Implementation Details:
 * - Retrieves version information from package.json
 * - Creates an embedded message with the bot version
 * - Replies to the interaction with the formatted embed
 */
export async function execute(interaction: CommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setColor(0xEB1A1A)
        .setTitle('Bot Version')
        .setDescription(`Current version: v${version}`)
        .setFooter({ text: `Unthread Discord Bot v${version}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}