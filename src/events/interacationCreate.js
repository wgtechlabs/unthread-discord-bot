const { Events, ChannelType, MessageFlags } = require('discord.js');
const { createTicket, bindTicketWithThread } = require('../services/unthread');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// for support ticket
		if (interaction.isModalSubmit() && interaction.customId === 'supportModal') {
			const issue = interaction.fields.getTextInputValue('issueInput');
			const email = interaction.fields.getTextInputValue('emailInput');
			console.log(`Support ticket submitted: ${issue}, email: ${email}`);

			 // Acknowledge the interaction immediately
			await interaction.deferReply({ ephemeral: true });

			let ticket;
			// Create ticket via unthread.io API (ensuring customer exists)
			try {
				ticket = await createTicket(interaction.user, issue, email);
				console.log('Ticket created:', ticket);
			} catch (error) {
				console.error('Ticket creation failed:', error);
				return;
			}

			// Create a private thread in the current channel
			const thread = await interaction.channel.threads.create({
					name: `support-${interaction.user.username}`,
					// autoArchiveDuration: 0, // Disable auto archive
					type: ChannelType.PrivateThread,
					reason: 'Support ticket',
			});
			
			// Add the user to the private thread
			await thread.members.add(interaction.user.id);
			
			 // Bind the Unthread ticket with the Discord thread
			// Assuming the ticket object has a property (e.g., id or ticketId) to be used
			await bindTicketWithThread(ticket.id, thread.id);
			
			 // Edit the deferred reply with confirmation
			await interaction.editReply('Your support ticket has been submitted! A private thread has been created for further communication.');
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