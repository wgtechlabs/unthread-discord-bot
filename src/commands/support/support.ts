/**
 * Support Command - Interactive Ticket Creation
 *
 * @description
 * Slash command providing modal-based interface for creating support tickets.
 * Validates permissions, handles forum channel conflicts, creates private threads,
 * and integrates with Unthread ticketing system for seamless support workflow.
 *
 * @module commands/support/support
 * @since 1.0.0
 *
 * @keyFunctions
 * - execute(): Main command handler with permission validation and modal presentation
 * - Modal submission handler: Processes ticket details and creates thread-ticket mapping
 *
 * @commonIssues
 * - Permission denied: Bot lacks "Create Private Threads" or "Send Messages" permissions
 * - Forum channel conflicts: Command used in forum channels causing interaction failures
 * - Modal timeout: Users don't submit modal within Discord's 15-minute timeout
 * - Thread creation failures: Channel limits reached or bot permissions insufficient
 * - Unthread integration errors: Ticket creation API calls failing during processing
 *
 * @troubleshooting
 * - Verify bot has required permissions in target channels and guild
 * - Check isValidatedForumChannel() to ensure proper channel type detection
 * - Monitor modal interaction timeouts and provide user guidance
 * - Review thread creation limits and channel configuration
 * - Check UNTHREAD_API_KEY validity and permissions for ticket creation
 * - Use LogEngine to trace interaction flow and error points
 *
 * @performance
 * - Modal interactions processed within Discord's timeout limits
 * - Permission checks performed early to prevent unnecessary processing
 * - Thread creation optimized to minimize API calls
 * - Error handling prevents hanging interactions
 *
 * @dependencies Discord.js interactions, channelUtils, Unthread ticket creation
 *
 * @example Basic Usage
 * ```typescript
 * // Slash command: /support
 * // Opens modal for ticket title and description input
 * // Creates private thread upon submission
 * ```
 *
 * @example Advanced Usage
 * ```typescript
 * // Command with permission validation
 * if (!interaction.memberPermissions?.has(PermissionFlagsBits.CreatePrivateThreads)) {
 *   await interaction.reply({ content: 'Insufficient permissions', ephemeral: true });
 *   return;
 * }
 * ```
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
	 * Executes support command with validation and modal presentation
	 *
	 * @async
	 * @function execute
	 * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
	 * @returns {Promise<void>} Resolves after modal presentation or error response
	 *
	 * @example
	 * ```typescript
	 * // Called automatically when user types: /support
	 * // Performs validation and shows ticket creation modal
	 * ```
	 *
	 * @troubleshooting
	 * - Validates guild context, channel type, and bot permissions
	 * - Prevents usage in forum channels and existing threads
	 * - Shows appropriate error messages for each validation failure
	 * - Creates modal with title, description, and email input fields
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