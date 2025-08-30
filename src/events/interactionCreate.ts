/**
 * Interaction Create Event Handler
 *
 * This module handles all Discord interactions for the bot, including:
 * - Modal submissions for support ticket creation
 * - Slash command executions
 * - Thread creation and binding with Unthread tickets
 *
 * The handler processes different interaction types and routes them to
 * the appropriate functions, maintaining a clean separation of concerns
 * for different interaction workflows.
 *
 * @module events/interactionCreate
 */

import { Events, ChannelType, Interaction, CommandInteraction, ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import { createTicket, bindTicketWithThread } from '../services/unthread';
import { LogEngine } from '../config/logger';
import { setKey } from '../utils/memory';
import { getOrCreateCustomer, getCustomerByDiscordId, updateCustomer } from '../utils/customerUtils';
import { getBotFooter } from '../utils/botUtils';

/**
 * Simple type for ticket objects from external API
 */
interface TicketResponse {
	id: string;
	friendlyId: string;
}

/**
 * Simple type for thread objects
 */
interface ThreadResponse {
	id: string;
	members: { add: (userId: string) => Promise<unknown> };
	send: (options: unknown) => Promise<unknown>;
}

/**
 * InteractionCreate event handler
 *
 * Main entry point for all Discord interactions.
 * Routes different interaction types to their appropriate handlers:
 * - Modal submissions for support tickets
 * - Chat input commands (slash commands)
 *
 * @param interaction - The Discord interaction object
 */
export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
	// ===== SUPPORT TICKET MODAL HANDLING =====
	if (interaction.isModalSubmit() && interaction.customId === 'supportModal') {
		await handleSupportModal(interaction);
		return;
	}

	// ===== COMMAND HANDLING =====
	// Only proceed if this is a slash command interaction
	if (!interaction.isChatInputCommand()) return;

	await handleSlashCommand(interaction);
}

/**
 * Handles support ticket modal submissions
 *
 * Processes the support ticket creation workflow:
 * 1. Extracts form data from modal (title, issue, email)
 * 2. Manages customer records and email handling
 * 3. Creates ticket in Unthread
 * 4. Creates Discord thread for ticket management
 * 5. Binds the thread to the ticket for synchronization
 *
 * @param interaction - The modal submit interaction from Discord
 */
async function handleSupportModal(interaction: ModalSubmitInteraction): Promise<void> {
	// Extract form data from modal submission
	const title = interaction.fields.getTextInputValue('titleInput');
	const issue = interaction.fields.getTextInputValue('issueInput');
	let email = interaction.fields.getTextInputValue('emailInput');

	if (!email || email.trim() === '') {
		// If no email provided, try to get existing customer record
		const existingCustomer = await getCustomerByDiscordId(interaction.user.id);
		email = existingCustomer?.email || `${interaction.user.username}@discord.user`;
		LogEngine.debug(`Using fallback email for user ${interaction.user.id}: ${email}`);
	}
	else {
		// If email provided, update or create customer record
		const existingCustomer = await getCustomerByDiscordId(interaction.user.id);
		if (existingCustomer) {
			existingCustomer.email = email;
			await updateCustomer(existingCustomer);
		}
		else {
			await getOrCreateCustomer(interaction.user, email);
		}
		LogEngine.debug(`Stored email for user ${interaction.user.id}: ${email}`);
	}

	LogEngine.debug(`Support ticket submitted: ${title}, ${issue}, email: ${email}`);

	// Acknowledge interaction immediately to prevent Discord timeout
	// Using ephemeral reply so only the submitter can see it
	await interaction.deferReply({ ephemeral: true });

	// Business objects that come from external APIs
	let ticket: unknown = null;
	let thread: unknown = null;
	// ===== TICKET CREATION WORKFLOW =====
	try {
		// Step 1: Create ticket in unthread.io using external API
		ticket = await createTicket(interaction.user, title, issue, email);
		LogEngine.debug('Ticket created:', ticket);

		// Type guard for ticket - we know ticket has id and friendlyId
		const ticketObj = ticket as TicketResponse;
		if (!ticketObj.friendlyId) {
			throw new Error('Ticket was created but no friendlyId was provided');
		}

		// Step 2: Create a private Discord thread for this ticket
		// This creates a separate conversation space for this support ticket
		if (!interaction.channel || !('threads' in interaction.channel)) {
			throw new Error('This command must be used in a text channel that supports threads');
		}

		// Create thread based on channel type to satisfy TypeScript's type constraints
		if (interaction.channel.type === ChannelType.GuildAnnouncement) {
			thread = await interaction.channel.threads.create({
				name: `ticket-#${ticketObj.friendlyId}`,
				type: ChannelType.AnnouncementThread,
				reason: 'Unthread Ticket',
			});
		}
		else {
			thread = await interaction.channel.threads.create({
				name: `ticket-#${ticketObj.friendlyId}`,
				type: ChannelType.PrivateThread,
				reason: 'Unthread Ticket',
			});
		}

		if (!thread) {
			throw new Error('Failed to create Discord thread');
		}

		// Type guard for thread - we know it has id, members, send methods
		const threadObj = thread as ThreadResponse;

		// Step 3: IMMEDIATELY associate the Discord thread with the ticket
		// This prevents race conditions with incoming webhooks by ensuring the mapping exists
		// before any messages are sent that could trigger webhook events
		await bindTicketWithThread(ticketObj.id, threadObj.id);

		// Step 4: Add the user who submitted the ticket to the private thread
		await threadObj.members.add(interaction.user.id);

		// Step 5: Send initial context information to the thread
		const ticketEmbed = new EmbedBuilder()
			.setColor(0xFF5241)
			.setTitle(`🎫 Support Ticket #${ticketObj.friendlyId}`)
			.setDescription(`**${title}**\n\n${issue}`)
			.addFields(
				{ name: '🔄 Next Steps', value: 'Our support team will respond here shortly. Please monitor this thread for updates.', inline: false },
			)
			.setFooter({ text: getBotFooter() })
			.setTimestamp();

		await threadObj.send({ embeds: [ticketEmbed] });

		// Step 6: Complete the interaction with confirmation message
		await interaction.editReply('Your support ticket has been submitted! A private thread has been created for further assistance.');
	}
	catch (error) {
		// Handle any failures in the ticket creation workflow
		// This could be API errors, permission issues, or Discord rate limits
		LogEngine.error('Ticket creation failed:', error);

		// Cleanup: If we created a mapping but failed afterwards, clean it up
		const ticketObj = ticket as TicketResponse | null;
		const threadObj = thread as ThreadResponse | null;
		if (ticketObj?.id && threadObj?.id) {
			try {
				// Remove the mapping to prevent orphaned entries
				// Set with short TTL to delete
				await setKey(`ticket:discord:${threadObj.id}`, null, 1);
				await setKey(`ticket:unthread:${ticketObj.id}`, null, 1);
				LogEngine.info(`Cleaned up orphaned ticket mapping: Discord thread ${threadObj.id} <-> Unthread ticket ${ticketObj.id}`);
			}
			catch (cleanupError) {
				LogEngine.error('Failed to cleanup orphaned ticket mapping:', cleanupError);
			}
		}

		await interaction.editReply('Sorry, there was an error creating your support ticket. Please try again later.');
		return;
	}
}

/**
 * Handles slash command interactions
 *
 * Looks up the appropriate command handler based on the command name
 * and executes it with proper error handling. If a command fails,
 * it provides user-friendly error messages while logging detailed
 * error information for debugging.
 *
 * Error handling includes:
 * - Command not found errors
 * - Execution errors with appropriate response methods
 * - Proper handling of already replied/deferred interactions
 *
 * @param interaction - The slash command interaction from Discord
 */
async function handleSlashCommand(interaction: CommandInteraction): Promise<void> {
	// Look up the command handler based on the command name
	// Type assertion for extended client with commands collection
	const client = interaction.client as unknown as {
		commands: Map<string, { execute: (interaction: CommandInteraction) => Promise<void> }>;
	};
	const command = client.commands.get(interaction.commandName);

	// Check if command exists in our registered commands
	if (!command) {
		LogEngine.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	// ===== COMMAND EXECUTION WITH ERROR HANDLING =====
	try {
		// Execute the command with the interaction context
		await command.execute(interaction);
	}
	catch (error) {
		// Log the full error for debugging
		LogEngine.error('Command execution error:', error);

		// Handle response based on interaction state
		// If we already replied or deferred, use followUp
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				ephemeral: true,
			});
		}
		else {
			// For fresh interactions, use reply
			await interaction.reply({
				content: 'There was an error while executing this command!',
				ephemeral: true,
			});
		}
	}
}