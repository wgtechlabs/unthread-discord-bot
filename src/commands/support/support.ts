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

import {
	SlashCommandBuilder,
	ModalBuilder,
	ActionRowBuilder,
	TextInputBuilder,
	TextInputStyle,
	PermissionFlagsBits,
	ChatInputCommandInteraction,
	GuildMember,
	TextChannel,
} from 'discord.js';
import channelUtils from '../../utils/channelUtils';

const { isValidatedForumChannel } = channelUtils;

/**
 * Support Command Definition
 *
 * Creates a slash command that allows users to submit support tickets.
 * The command validates permissions and channel types before presenting
 * a modal interface for ticket details.
 */
const supportCommand = {
	data: new SlashCommandBuilder()
		.setName('support')
		.setDescription('Open a support ticket'),

	/**
	 * Executes the support command
	 *
	 * Validates the execution context and presents a ticket creation modal.
	 * Performs the following checks:
	 * 1. Ensures command is used in a guild with a valid channel
	 * 2. Ensures command is not used in threads
	 * 3. Verifies channel is not configured for forum-based tickets
	 * 4. Checks bot permissions for thread creation
	 * 5. Presents modal interface for ticket submission
	 *
	 * @param interaction - The slash command interaction
	 */
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		// Add guild and channel validation before proceeding
		if (!interaction.inGuild() || !interaction.channel) {
			await interaction.reply({
				content: '❌ **Cannot use `/support` here**\n\nPlease run this command inside a server text channel.',
				ephemeral: true,
			});
			return;
		}

		// Check if the command is used in any thread (forum posts, private threads, etc.)
		if (interaction.channel.isThread()) {
			await interaction.reply({
				content: '❌ **Cannot use `/support` command in threads**\n\nThe `/support` command can only be used in text channels. Please use `/support` in the main channel instead of inside threads or forum posts.',
				ephemeral: true,
			});
			return;
		}

		// Check if the current channel is configured as a forum channel
		const isConfiguredForumChannel = await isValidatedForumChannel(interaction.channel.id);
		if (isConfiguredForumChannel) {
			await interaction.reply({
				content: '❌ **Cannot use `/support` command here**\n\nThis channel is configured for forum-based tickets. Please create a new forum post instead of using the `/support` command.',
				ephemeral: true,
			});
			return;
		}

		// Check if bot has necessary permissions to create threads in this channel
		const botMember = interaction.guild?.members.me as GuildMember;
		const requiredPermissions = [
			PermissionFlagsBits.ManageThreads,
			PermissionFlagsBits.CreatePrivateThreads,
			PermissionFlagsBits.SendMessages,
			PermissionFlagsBits.SendMessagesInThreads,
			PermissionFlagsBits.ViewChannel,
		];

		if (!interaction.guild || !interaction.channel || !botMember?.permissionsIn(interaction.channel as TextChannel).has(requiredPermissions)) {
			await interaction.reply({
				content: `❌ **Cannot create support tickets here**

Missing permissions: **Manage Threads**, **Create Private Threads**, **Send Messages**, **Send Messages in Threads**, **View Channel**

Ask an admin to grant these permissions or use \`/support\` in an authorized channel.`,
				ephemeral: true,
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
			.setRequired(true)
			.setMinLength(5)
			.setMaxLength(100);

		const issueInput = new TextInputBuilder()
			.setCustomId('issueInput')
			.setLabel('Summary')
			.setPlaceholder('Please describe your issue...')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setMaxLength(2000);

		const emailInput = new TextInputBuilder()
			.setCustomId('emailInput')
			.setLabel('Contact Email (Optional)')
			.setPlaceholder('Your email address or leave blank...')
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setMaxLength(254);

		// Add inputs to the modal
		const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
		const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(issueInput);
		const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput);
		modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

		// Show the modal
		await interaction.showModal(modal);
	},
};

export default supportCommand;