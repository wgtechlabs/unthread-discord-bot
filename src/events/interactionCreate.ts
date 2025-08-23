import { Events, MessageFlags, Interaction, CommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { createTicket, bindTicketWithThread } from '../services/unthread';
import { LogEngine } from '../config/logger';
import { setKey } from '../utils/memory';
import { getOrCreateCustomer, getCustomerByDiscordId, updateCustomer } from '../utils/customerUtils';

/**
 * InteractionCreate event handler
 * Handles all Discord interactions including:
 * - Modal submissions for support tickets
 * - Chat input commands
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
    } else {
        // If email provided, update or create customer record
        const existingCustomer = await getCustomerByDiscordId(interaction.user.id);
        if (existingCustomer) {
            existingCustomer.email = email;
            await updateCustomer(existingCustomer);
        } else {
            await getOrCreateCustomer(interaction.user, email);
        }
        LogEngine.debug(`Stored email for user ${interaction.user.id}: ${email}`);
    }

    LogEngine.debug(`Support ticket submitted: ${title}, ${issue}, email: ${email}`);

	// Acknowledge interaction immediately to prevent Discord timeout
	// Using ephemeral reply so only the submitter can see it
	await interaction.deferReply({ ephemeral: true });

    let ticket: any;
    let thread: any;
    // ===== TICKET CREATION WORKFLOW =====
    try {
        // Step 1: Create ticket in unthread.io using external API
        ticket = await createTicket(interaction.user, title, issue, email);
        LogEngine.debug('Ticket created:', ticket);
        
        // Validate ticket creation was successful
        if (!ticket.friendlyId) {
            throw new Error('Ticket was created but no friendlyId was provided');
        }
        
        // Step 2: Create a private Discord thread for this ticket
        // This creates a separate conversation space for this support ticket
        if (!interaction.channel || !('threads' in interaction.channel)) {
            throw new Error('This command must be used in a text channel that supports threads');
        }
        
        thread = await interaction.channel.threads.create({
            name: `ticket-#${ticket.friendlyId}`,
            reason: 'Unthread Ticket',
        });
        
        if (!thread) {
            throw new Error('Failed to create Discord thread');
        }
        
        // Step 3: IMMEDIATELY associate the Discord thread with the ticket
        // This prevents race conditions with incoming webhooks by ensuring the mapping exists
        // before any messages are sent that could trigger webhook events
        await bindTicketWithThread(ticket.id, thread.id);
        
        // Step 4: Add the user who submitted the ticket to the private thread
        await thread.members.add(interaction.user.id);

		// Step 5: Send initial context information to the thread
		await thread.send({
			content: `
                > **Ticket #:** ${ticket.friendlyId}\n> **Title:** ${title}\n> **Issue:** ${issue}
            `,
		});

        // Step 6: Send confirmation message
        await thread.send({
            content: `Hello <@${interaction.user.id}>, we have received your ticket and will respond shortly. Please check this thread for updates.`,
        });
        
        // Step 7: Complete the interaction with confirmation message
        await interaction.editReply('Your support ticket has been submitted! A private thread has been created for further assistance.');
    } catch (error) {
        // Handle any failures in the ticket creation workflow
        // This could be API errors, permission issues, or Discord rate limits
        LogEngine.error('Ticket creation failed:', error);
        
        // Cleanup: If we created a mapping but failed afterwards, clean it up
        if (ticket && ticket.id && thread && thread.id) {
            try {
                // Remove the mapping to prevent orphaned entries
                await setKey(`ticket:discord:${thread.id}`, null, 1); // Set with short TTL to delete
                await setKey(`ticket:unthread:${ticket.id}`, null, 1);
                LogEngine.info(`Cleaned up orphaned ticket mapping: Discord thread ${thread.id} <-> Unthread ticket ${ticket.id}`);
            } catch (cleanupError) {
                LogEngine.error('Failed to cleanup orphaned ticket mapping:', cleanupError);
            }
        }
        
        await interaction.editReply('Sorry, there was an error creating your support ticket. Please try again later.');
        return;
    }
}

async function handleSlashCommand(interaction: CommandInteraction): Promise<void> {
	// Look up the command handler based on the command name
	// Type assertion for extended client
	const client = interaction.client as any;
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
    } catch (error) {
        // Log the full error for debugging
        LogEngine.error('Command execution error:', error);
        
        // Handle response based on interaction state
        // If we already replied or deferred, use followUp
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: 'There was an error while executing this command!', 
                flags: MessageFlags.Ephemeral 
            });
        } else {
            // For fresh interactions, use reply
            await interaction.reply({ 
                content: 'There was an error while executing this command!', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
}