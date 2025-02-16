const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Open a support ticket'),
    
    async execute(interaction) {
        // Create modal
        const modal = new ModalBuilder()
            .setCustomId('supportModal')
            .setTitle('Support Ticket');

        // Add input fields
        const issueInput = new TextInputBuilder()
            .setCustomId('issueInput')
            .setLabel('Describe your issue')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const emailInput = new TextInputBuilder()
            .setCustomId('emailInput')
            .setLabel('Your Email Address')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Add inputs to the modal
        const firstActionRow = new ActionRowBuilder().addComponents(issueInput);
        const secondActionRow = new ActionRowBuilder().addComponents(emailInput);
        modal.addComponents(firstActionRow, secondActionRow);

        // Show the modal
        await interaction.showModal(modal);
    },
};