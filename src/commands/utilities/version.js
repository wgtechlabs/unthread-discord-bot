const { SlashCommandBuilder } = require('discord.js');
const { version } = require('../../../package.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('version')
		.setDescription('Displays the current bot version.'),
	async execute(interaction) {
		await interaction.reply(`Current version: v${version}`);
	},
};
