const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');

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

        // Check if bot has necessary permissions to create threads in this channel
        const botMember = interaction.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.ManageThreads,
            PermissionFlagsBits.CreatePrivateThreads,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ViewChannel
        ];

        if (!botMember.permissionsIn(interaction.channel).has(requiredPermissions)) {
            await interaction.reply({
                content: 'I don\'t have the necessary permissions to create support tickets in this channel. Please use this command in an authorized channel or contact an administrator.',
                ephemeral: true
            });
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
            .setLabel('Contact Email (Optional)')
            .setPlaceholder('Your email address or leave blank...')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        // Add inputs to the modal
        const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
        const secondActionRow = new ActionRowBuilder().addComponents(issueInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(emailInput);
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        // Show the modal
        await interaction.showModal(modal);
    },
};