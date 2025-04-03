const { Events, ChannelType, MessageFlags } = require('discord.js');
const { createTicket, bindTicketWithThread } = require('../services/unthread');

/**
 * InteractionCreate event handler
 * Handles all Discord interactions including:
 * - Modal submissions for support tickets
 * - Chat input commands
 */
module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // ===== SUPPORT TICKET MODAL HANDLING =====
        if (interaction.isModalSubmit() && interaction.customId === 'supportModal') {
            // Extract form data from modal submission
            const title = interaction.fields.getTextInputValue('titleInput'); 
            const issue = interaction.fields.getTextInputValue('issueInput');
            const email = interaction.fields.getTextInputValue('emailInput');
            console.log(`Support ticket submitted: ${title}, ${issue}, email: ${email}`);

            // Acknowledge interaction immediately to prevent Discord timeout
            // Using ephemeral reply so only the submitter can see it
            await interaction.deferReply({ ephemeral: true });

            let ticket;
            // ===== TICKET CREATION WORKFLOW =====
            try {
                // Step 1: Create ticket in unthread.io using external API
                ticket = await createTicket(interaction.user, title, issue, email);
                console.log('Ticket created:', ticket);
                
                // Validate ticket creation was successful
                if (!ticket.friendlyId) {
                    throw new Error('Ticket was created but no friendlyId was provided');
                }
                
                // Step 2: Create a private Discord thread for this ticket
                // This creates a separate conversation space for this support ticket
                const thread = await interaction.channel.threads.create({
                    name: `ticket-#${ticket.friendlyId}`,
                    type: ChannelType.PrivateThread,
                    reason: 'Unthread Ticket',
                });
                
                // Step 3: Add the user who submitted the ticket to the private thread
                await thread.members.add(interaction.user.id);

                // Step 4: Send initial context information to the thread
                await thread.send({
                    content: `
                        > **Ticket #:** ${ticket.friendlyId}\n> **Title:** ${title}\n> **Issue:** ${issue}
                    `,
                });
                
                // Step 5: Associate the Discord thread with the ticket in the backend
                // This allows messages in the thread to be synced with the ticket system
                await bindTicketWithThread(ticket.id, thread.id);
                
                // Step 6: Complete the interaction with confirmation message
                await interaction.editReply('Your support ticket has been submitted! A private thread has been created for further communication.');
            } catch (error) {
                // Handle any failures in the ticket creation workflow
                // This could be API errors, permission issues, or Discord rate limits
                console.error('Ticket creation failed:', error);
                await interaction.editReply('Sorry, there was an error creating your support ticket. Please try again later.');
                return;
            }

            return;
        }

        // ===== COMMAND HANDLING =====
        // Only proceed if this is a slash command interaction
        if (!interaction.isChatInputCommand()) return;

        // Look up the command handler based on the command name
        const command = interaction.client.commands.get(interaction.commandName);

        // Check if command exists in our registered commands
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // ===== COMMAND EXECUTION WITH ERROR HANDLING =====
        try {
            // Execute the command with the interaction context
            await command.execute(interaction);
        } catch (error) {
            // Log the full error for debugging
            console.error(error);
            
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
    },
};