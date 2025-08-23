import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';

/**
 * Server Command
 * 
 * Provides detailed information about the current Discord server.
 * Displays key server metrics including server name, member count, and creation date.
 * 
 * @module commands/utilities/server
 */
export const data = new SlashCommandBuilder()
    .setName('server')
    .setDescription('Provides information about the server.');

/**
 * Executes the server command.
 * 
 * @async
 * @param {CommandInteraction} interaction - The interaction object from Discord.js.
 * @returns {Promise<void>}
 * 
 * Implementation Details:
 * - Retrieves server information from the interaction's guild object
 * - Formats the server creation timestamp as a Discord timestamp
 * - Creates an embedded message with relevant server information
 * - Replies to the interaction with the formatted embed
 */
export async function execute(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0xEB1A1A)
        .setTitle('Server Information')
        .addFields(
            { name: 'Server Name', value: interaction.guild.name, inline: true },
            { name: 'Total Members', value: `${interaction.guild.memberCount}`, inline: true },
            { name: 'Created At', value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:F>`, inline: false }
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: `Server ID: ${interaction.guild.id}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}