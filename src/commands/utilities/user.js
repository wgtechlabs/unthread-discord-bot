const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

/**
 * User Command
 * 
 * Provides detailed information about the Discord user who triggered the command.
 * Displays key user information including username, server join date, and account creation date.
 * 
 * @module commands/utilities/user
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Provides information about the user.'),
	
	/**
     * Executes the user command.
     * 
     * @async
     * @param {Interaction} interaction - The interaction object from Discord.js.
     * @returns {Promise<void>}
     * 
     * Implementation Details:
     * - Retrieves user information from the interaction object
     * - Formats timestamps using Discord's timestamp formatting
     * - Creates an embedded message with relevant user information
     * - Replies to the interaction with the formatted embed
     */
	async execute(interaction) {
		const embed = new EmbedBuilder()
			.setColor(0xEB1A1A)
			.setTitle('User Information')
			.addFields(
				{ name: 'Username', value: interaction.user.username, inline: true },
				{ name: 'Joined Server', value: `<t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:F>`, inline: true },
				{ name: 'Account Created', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:F>`, inline: false }
			)
			.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
			.setFooter({ text: `User ID: ${interaction.user.id}` })
			.setTimestamp();
		
		await interaction.reply({ embeds: [embed] });
	},
};