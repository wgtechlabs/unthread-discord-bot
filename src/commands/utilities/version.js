const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { version } = require('../../../package.json');

/**
 * Version Command
 * 
 * Provides information about the current bot version to users.
 * Fetches version information from the package.json file and displays it in an embedded message.
 * 
 * @module commands/utilities/version
 */
module.exports = {
	data: new SlashCommandBuilder()
		.setName('version')
		.setDescription('Displays the current bot version.'),
	
	/**
     * Executes the version command.
     * 
     * @async
     * @param {Interaction} interaction - The interaction object from Discord.js.
     * @returns {Promise<void>}
     * 
     * Implementation Details:
     * - Retrieves version information from package.json
     * - Creates an embedded message with the bot version
     * - Replies to the interaction with the formatted embed
     */
	async execute(interaction) {
		const embed = new EmbedBuilder()
			.setColor(0xEB1A1A)
			.setTitle('Bot Version')
			.setDescription(`Current version: v${version}`)
			.setFooter({ text: 'Unthread Discord Bot' })
			.setTimestamp();
		
		await interaction.reply({ embeds: [embed] });
	},
};
