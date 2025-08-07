/**
 * Support Command Module
 * 
 * Provides the /support slash command for creating support tickets.
 * This command opens a modal interface for users to submit ticket details,
 * then creates a private thread for ticket management.
 * 
 * Features:
 * - Modal-based ticket creation interface
 * - Permission validation for thread creation
 * - Forum channel conflict detection
 * - Thread-based ticket management
 * 
 * @module commands/support/support
 */

const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { isValidatedForumChannel } = require('../../utils/channelUtils');

/**
 * Support Command Definition
 * 
 * Creates a slash command that allows users to submit support tickets.
 * The command validates permissions and channel types before presenting
 * a modal interface for ticket details.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Open a support ticket'),
    
    /**
     * Executes the support command
     * 
     * Validates the execution context and presents a ticket creation modal.
     * Performs the following checks:
     * 1. Ensures command is not used in threads
     * 2. Verifies channel is not configured for forum-based tickets
     * 3. Checks bot permissions for thread creation
     * 4. Presents modal interface for ticket submission
     * 
     * @async
     * @param {Discord.Interaction} interaction - The slash command interaction
     * @returns {Promise<void>}
     * 
     * @throws {Error} If permissions are insufficient or channel is invalid
     */
    async execute(interaction) {
        // Check if the command is used in any thread (forum posts, private threads, etc.)
        if (interaction.channel.isThread()) {
            await interaction.reply({ 
                content: '❌ **Cannot use `/support` command in threads**\n\nThe `/support` command can only be used in text channels. Please use `/support` in the main channel instead of inside threads or forum posts.', 
                ephemeral: true 
            });
            return;
        }

        // Check if the current channel is configured as a forum channel
        const isConfiguredForumChannel = await isValidatedForumChannel(interaction.channel.id);
        if (isConfiguredForumChannel) {
            await interaction.reply({ 
                content: '❌ **Cannot use `/support` command here**\n\nThis channel is configured for forum-based tickets. Please create a new forum post instead of using the `/support` command.', 
                ephemeral: true 
            });
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
                content: `❌ **Cannot create support tickets here**

Missing permissions: **Manage Threads**, **Create Private Threads**, **Send Messages**, **Send Messages in Threads**, **View Channel**

Ask an admin to grant these permissions or use \`/support\` in an authorized channel.`,
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