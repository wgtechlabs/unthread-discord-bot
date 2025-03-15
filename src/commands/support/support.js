const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Open a support ticket'),
    
    async execute(interaction) {
        // Check if the command is used in a thread and if so, prevent execution
        if (interaction.channel.isThread && interaction.channel.isThread()) {
            await interaction.reply({ content: 'The `/support` command can only be used in a text channel.', ephemeral: true });
            return;
        }

        // Create modal
        const modal = new ModalBuilder()
            .setCustomId('supportModal')
            .setTitle('Support Ticket');

        // Add input fields
        const titleInput = new TextInputBuilder()
            .setCustomId('titleInput')
            .setLabel('Ticket Title')
            .setPlaceholder('Title of your issue...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const issueInput = new TextInputBuilder()
            .setCustomId('issueInput')
            .setLabel('Summary')
            .setPlaceholder('Please describe your issue...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const emailInput = new TextInputBuilder()
            .setCustomId('emailInput')
            .setLabel('Contact Email')
            .setPlaceholder('Your email valid address...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Add inputs to the modal
        const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
        const secondActionRow = new ActionRowBuilder().addComponents(issueInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(emailInput);
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        // Show the modal
        await interaction.showModal(modal);
    },
};