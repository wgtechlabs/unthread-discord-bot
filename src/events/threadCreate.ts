/**
 * Thread Creation Event Handler
 * Converts new forum posts in validated forum channels to Unthread support tickets.
 *
 * Now includes		// Notify users in the thread that a ticket has been created.
		const ticketEmbed = new EmbedBuilder()
			.setColor(0xFF5241)
			.setTitle(`🎫 Support Ticket #${ticket.friendlyId}`)
			.setDescription(`**${title}**\n\n${content}`)
			.addFields(
				{ name: '🔄 Next Steps', value: 'Our support team will respond here shortly. Please monitor this thread for updates.', inline: false },
			)
			.setFooter({ text: `Unthread Discord Bot v${version}` })
			.setTimestamp();e validation to ensure only actual forum channels
 * are processed, preventing conflicts with text channels accidentally added
 * to FORUM_CHANNEL_IDS.
 */
import { Events, EmbedBuilder, PermissionFlagsBits, ThreadChannel, Message } from 'discord.js';
import { createTicket, bindTicketWithThread } from '../services/unthread';
import { withRetry } from '../utils/retry';
import { LogEngine } from '../config/logger';
import { getOrCreateCustomer } from '../utils/customerUtils';
import { isValidatedForumChannel } from '../utils/channelUtils';
import { version } from '../../package.json';

export const name = Events.ThreadCreate;

export async function execute(thread: ThreadChannel): Promise<void> {
	try {
		// Ignore threads created in channels that are not validated forum channels.
		const isValidForum = await isValidatedForumChannel(thread.parentId || '');
		if (!isValidForum) return;
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		LogEngine.error('Error validating forum channel:', errorMessage);
		LogEngine.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
		LogEngine.error('Skipping thread processing due to validation error');
		return;
	}

	LogEngine.info(`New forum post detected in monitored channel: ${thread.name}`);

	// Check bot permissions before proceeding with any Discord actions
	const botMember = thread.guild.members.me;
	if (!botMember) {
		LogEngine.error('Bot member not found in guild');
		return;
	}

	const requiredPermissions = [
		PermissionFlagsBits.SendMessagesInThreads,
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.SendMessages,
	];

	// Check permissions in the parent forum channel
	const parentChannel = thread.parent;
	if (!parentChannel) {
		LogEngine.error('Parent channel not found for thread');
		return;
	}

	const parentPermissions = botMember.permissionsIn(parentChannel);
	if (!parentPermissions.has(requiredPermissions)) {
		const missingPermissions = requiredPermissions.filter(perm => !parentPermissions.has(perm));
		const permissionNames = missingPermissions.map(perm => {
			switch (perm) {
			case PermissionFlagsBits.SendMessagesInThreads: return 'Send Messages in Threads';
			case PermissionFlagsBits.ViewChannel: return 'View Channel';
			case PermissionFlagsBits.ReadMessageHistory: return 'Read Message History';
			case PermissionFlagsBits.SendMessages: return 'Send Messages';
			default: return 'Unknown Permission';
			}
		});

		LogEngine.error(`Cannot create support tickets in forum channel "${parentChannel.name}" (${parentChannel.id})`);
		LogEngine.error(`Missing permissions: ${permissionNames.join(', ')}`);
		LogEngine.error('Action required: Ask a server administrator to grant the bot these permissions in the forum channel.');
		LogEngine.error(`Guild: ${thread.guild.name} (${thread.guild.id})`);
		return;
	}

	// Also check permissions specifically in the thread
	const threadPermissions = botMember.permissionsIn(thread as Parameters<typeof botMember.permissionsIn>[0]);
	const threadRequiredPermissions = [
		PermissionFlagsBits.SendMessagesInThreads,
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.ReadMessageHistory,
	];

	if (!threadPermissions.has(threadRequiredPermissions)) {
		const missingThreadPermissions = threadRequiredPermissions.filter(perm => !threadPermissions.has(perm));
		const threadPermissionNames = missingThreadPermissions.map(perm => {
			switch (perm) {
			case PermissionFlagsBits.SendMessagesInThreads: return 'Send Messages in Threads';
			case PermissionFlagsBits.ViewChannel: return 'View Channel';
			case PermissionFlagsBits.ReadMessageHistory: return 'Read Message History';
			default: return 'Unknown Permission';
			}
		});

		LogEngine.error(`Cannot process forum thread "${thread.name}" (${thread.id})`);
		LogEngine.error(`Missing thread permissions: ${threadPermissionNames.join(', ')}`);
		LogEngine.error('Action required: Ask a server administrator to grant the bot these permissions for forum threads.');
		LogEngine.error(`Guild: ${thread.guild.name} (${thread.guild.id})`);
		return;
	}

	LogEngine.info(`Permission check passed for forum thread "${thread.name}" in channel "${parentChannel.name}"`);

	// Declare in higher scope for error logging access
	let firstMessage: Message | undefined;

	try {
		// Fetch the first message with our retry mechanism
		firstMessage = await withRetry(
			async () => {
				const messages = await thread.messages.fetch({ limit: 1 });
				const message = messages.first();

				if (!message) {
					throw new Error('No message found in thread');
				}

				return message;
			},
			{
				operationName: 'Fetch initial forum post message',
				// Increased from 5 to 12 attempts
				maxAttempts: 12,
				// Increased from 3000 to 10000 (10s)
				baseDelayMs: 10000,
				// This will provide delays of: 10s, 20s, 30s... up to around 2 minutes total
			},
		);

		// Extract details from the forum post.
		const author = firstMessage.author;
		const title = thread.name;
		const content = firstMessage.content;

		// Retrieve or create customer using the new customerUtils module.
		const customer = await getOrCreateCustomer(author, `${author.username}@discord.user`);
		const email = customer.email;

		// Create a support ticket in Unthread using the forum post details.
		const ticket = await createTicket(author, title, content, email);

		// Link the Discord thread with the Unthread ticket for communication.
		await bindTicketWithThread(ticket.id, thread.id);

		// Notify users in the thread that a ticket has been created.
		const ticketEmbed = new EmbedBuilder()
			.setColor(0xFF5241)
			.setTitle(`🎫 Support Ticket #${ticket.friendlyId}`)
			.setDescription(`**${title}**\n\n${content}`)
			.addFields(
				{ name: '� Next Steps', value: 'Our support team will respond here shortly. Please monitor this thread for updates.', inline: false },
			)
			.setFooter({ text: `Unthread Discord Bot v${version}` })
			.setTimestamp();

		await thread.send({ embeds: [ticketEmbed] });

		LogEngine.info(`Forum post converted to ticket: #${ticket.friendlyId}`);
	}
	catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes('timeout')) {
			LogEngine.error('Ticket creation is taking longer than expected. Please wait and try again.');
			LogEngine.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
		}
		else {
			LogEngine.error('An error occurred while creating the ticket:', errorMessage);
			LogEngine.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
			LogEngine.error(`Author: ${firstMessage?.author?.tag || 'Unknown'} (${firstMessage?.author?.id || 'Unknown'})`);
		}

		try {
			// Only attempt to send error message if we have the necessary permissions
			const canSendMessages = botMember.permissionsIn(thread as Parameters<typeof botMember.permissionsIn>[0]).has([
				PermissionFlagsBits.SendMessagesInThreads,
				PermissionFlagsBits.ViewChannel,
			]);

			if (canSendMessages) {
				// Notify users in the thread about the error.
				const errorEmbed = new EmbedBuilder()
					.setColor(0xFF0000)
					.setTitle('Error Creating Support Ticket')
					.setDescription('There was an error creating a support ticket from this forum post. A staff member will assist you shortly.')
					.setFooter({ text: `Unthread Discord Bot v${version}` })
					.setTimestamp();

				await thread.send({ embeds: [errorEmbed] });
				LogEngine.info('Sent error notification to user in thread');
			}
			else {
				LogEngine.warn('Cannot send error message to user - missing permissions');
				LogEngine.warn('Users will not be notified of the ticket creation failure');
				LogEngine.warn('Administrator action required: Grant bot "Send Messages in Threads" and "View Channel" permissions');
			}
		}
		catch (sendError: unknown) {
			const sendErrorMessage = sendError instanceof Error ? sendError.message : String(sendError);
			LogEngine.error('Could not send error message to thread:', sendErrorMessage);
			const sendErrorObj = sendError as { code?: number };
			if (sendErrorObj.code === 50001) {
				LogEngine.error('Error Code 50001: Missing Access - Bot lacks permission to send messages in this thread');
				LogEngine.error('Administrator action required: Grant bot "Send Messages in Threads" permission');
			}
			LogEngine.error(`Thread: "${thread.name}" (${thread.id}) in Guild: ${thread.guild.name} (${thread.guild.id})`);
		}
	}
}