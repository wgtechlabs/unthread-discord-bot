import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';

/**
 * User Command
 *
 * Provides detailed information about the Discord user who triggered the command.
 * Displays key user information including username, server join date, and account creation date.
 *
 * @module commands/utilities/user
 */
export const data = new SlashCommandBuilder()
	.setName('user')
	.setDescription('Provides information about the user.');

/**
 * Executes the user command.
 *
 * @async
 * @param {CommandInteraction} interaction - The interaction object from Discord.js.
 * @returns {Promise<void>}
 *
 * Implementation Details:
 * - Retrieves user information from the interaction object
 * - Formats timestamps using Discord's timestamp formatting
 * - Creates an embedded message with relevant user information
 * - Replies to the interaction with the formatted embed
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	if (!interaction.inGuild()) {
		await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
		return;
	}

	// Handle both GuildMember and APIInteractionGuildMember
	const member = interaction.member;
	const joinedTimestamp = 'joinedTimestamp' in member ? member.joinedTimestamp : null;
	const joinedField = joinedTimestamp
		? `<t:${Math.floor(joinedTimestamp / 1000)}:F>`
		: 'Unavailable';

	const embed = new EmbedBuilder()
		.setColor(0xEB1A1A)
		.setTitle('User Information')
		.addFields(
			{ name: 'Username', value: interaction.user.username, inline: true },
			{ name: 'Joined Server', value: joinedField, inline: true },
			{ name: 'Account Created', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:F>`, inline: false },
		)
		.setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
		.setFooter({ text: `User ID: ${interaction.user.id}` })
		.setTimestamp();

	await interaction.reply({ embeds: [embed] });
}