const { Events, ChannelType, MessageFlags } = require('discord.js');
const { createTicket, bindTicketWithThread } = require('../services/unthread');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// for support ticket
		if (interaction.isModalSubmit() && interaction.customId === 'supportModal') {
			const title = interaction.fields.getTextInputValue('titleInput'); // Get the title input value
			const issue = interaction.fields.getTextInputValue('issueInput');
			const email = interaction.fields.getTextInputValue('emailInput');
			console.log(`Support ticket submitted: ${title}, ${issue}, email: ${email}`);

			 // Acknowledge the interaction immediately
			await interaction.deferReply({ ephemeral: true });

			let ticket;
			// Create ticket via unthread.io API (ensuring customer exists)
			try {
				ticket = await createTicket(interaction.user, title, issue, email); // Pass the title input value
				console.log('Ticket created:', ticket);
				
				if (!ticket.friendlyId) {
					throw new Error('Ticket was created but no friendlyId was provided');
				}
				
				// Create a private thread in the current channel
				const thread = await interaction.channel.threads.create({
					name: `ticket-#${ticket.friendlyId}`,
					type: ChannelType.PrivateThread,
					reason: 'Unthread Ticket',
				});
				
				// Add the user to the private thread
				await thread.members.add(interaction.user.id);

				// Send the initial message to the thread
				await thread.send({
					content: `
						> **Ticket #:** ${ticket.friendlyId}\n> **Title:** ${title}\n> **Issue:** ${issue}\n> **Contact:** ${email}
					`,
				});
				
				 // Bind the Unthread ticket with the Discord thread
				// Assuming the ticket object has a property (e.g., id or ticketId) to be used
				await bindTicketWithThread(ticket.id, thread.id);
				
				 // Edit the deferred reply with confirmation
				await interaction.editReply('Your support ticket has been submitted! A private thread has been created for further communication.');
			} catch (error) {
				console.error('Ticket creation failed:', error);
				await interaction.editReply('Sorry, there was an error creating your support ticket. Please try again later.');
				return;
			}

			return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ 
					content: 'There was an error while executing this command!', 
					flags: MessageFlags.Ephemeral 
				});
			} else {
				await interaction.reply({ 
					content: 'There was an error while executing this command!', 
					flags: MessageFlags.Ephemeral 
				});
			}
		}
	},
};