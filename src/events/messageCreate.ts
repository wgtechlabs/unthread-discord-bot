import { Events, Message } from "discord.js";
import { version } from "../../package.json";
import { sendMessageToUnthread, getTicketByDiscordThreadId, getCustomerById } from "../services/unthread";
import { isValidatedForumChannel } from "../utils/channelUtils";
import { LogEngine } from "../config/logger";

/**
 * Message Creation Event Handler
 * 
 * This module processes all incoming messages to the bot and handles integration
 * between Discord threads and Unthread tickets.
 * 
 * Key responsibilities:
 * 1. Forwards messages from support threads to corresponding Unthread tickets
 * 2. Preserves message context by formatting quotes/replies properly
 * 3. Handles attachments and converts them to markdown links
 * 4. Implements legacy command handling (!!ping, !!version)
 * 
 * @module events/messageCreate
 * @requires discord.js
 * @requires ../services/unthread
 * @requires ../utils/logger
 * 
 * @event MessageCreate - Triggered whenever a message is sent in a channel the bot can see
 */
export const name = Events.MessageCreate;
export const once = false;

/**
 * Main event handler for message creation events
 * 
 * This function determines what to do with each incoming message:
 * - Skip bot messages to prevent loops
 * - Forward thread messages to Unthread if in a mapped thread
 * - Process legacy commands with !! prefix
 * 
 * @param {Message} message - The Discord message object containing all message data
 * @returns {Promise<void>} - No return value
 * 
 * @debug
 * Common issues to check if messages aren't being forwarded:
 * 1. Verify the thread has a ticket mapping in the cache
 * 2. Check FORUM_CHANNEL_IDS environment variable contains valid forum channel IDs
 * 3. Ensure the Unthread API key has proper permissions
 * 4. Look for errors in the sendMessageToUnthread response
 */
export async function execute(message: Message): Promise<void> {
  // Ignore bot messages to prevent potential feedback loops
  if (message.author.bot) return;

  // If the message is in a thread, check for its mapping to forward to Unthread
  if (message.channel.isThread()) {
    try {
      // Skip processing if this is the initial forum post that created the thread
      // (Forum post IDs match their containing thread ID)
      const isValidForum = await isValidatedForumChannel(message.channel.parentId || '');
      const isForumPost = isValidForum && message.id === message.channel.id;

      if (isForumPost) {
        LogEngine.debug(`Skipping forum post ID ${message.id} that created thread ${message.channel.id}`);
        return;
      }

      // Retrieve the ticket mapping by Discord thread ID
      const ticketMapping = await getTicketByDiscordThreadId(message.channel.id);
      if (ticketMapping) {
        let messageToSend = message.content;

        // Handle quoted/referenced message for better context preservation
        if (message.reference && message.reference.messageId) {
          let quotedMessage: string;
          try {
            const referenced = await message.channel.messages.fetch(message.reference.messageId);
            quotedMessage = `> ${referenced.content}`;
            messageToSend = `${quotedMessage}\n\n${message.content}`;
            LogEngine.debug(`Added quote context from message ${message.reference.messageId}`);
          } catch (err) {
            LogEngine.error('Error fetching the referenced message:', err);
            // Continue with original message if quote retrieval fails
          }
        }

        // Process and format attachments into markdown links
        if (message.attachments.size > 0) {
          const attachments = Array.from(message.attachments.values());
          if (attachments.length > 0) {
            // Dynamically determine attachment type for better presentation
            const attachmentLinks = attachments.map((attachment, index) => {
              const type = attachment.contentType?.startsWith('image/') 
                ? 'image' 
                : attachment.contentType?.startsWith('video/') 
                  ? 'video' 
                  : 'file';
              return `[${type}_${index + 1}](${attachment.url})`;
            });

            // Add attachments list to the message with separator characters
            messageToSend = messageToSend || '';
            messageToSend += `\n\nAttachments: ${attachmentLinks.join(' | ')}`;
            LogEngine.debug(`Added ${attachments.length} attachments to message`);
          }
        }

        // Retrieve or create customer email for Unthread ticket association
        const customer = await getCustomerById(message.author.id);
        const email = customer?.email || `${message.author.username}@discord.user`;
        
        LogEngine.debug(`Forwarding message to Unthread ticket ${ticketMapping.unthreadTicketId}`, {
          threadId: message.channel.id,
          authorId: message.author.id,
          hasAttachments: message.attachments.size > 0,
          messageLength: messageToSend.length
        });

        // Forward the message to Unthread's API
        const response = await sendMessageToUnthread(
          ticketMapping.unthreadTicketId,
          message.author,
          messageToSend,
          email
        );
        LogEngine.info(`Forwarded message to Unthread for ticket ${ticketMapping.unthreadTicketId}`, response);
      } else {
        LogEngine.debug(`Message in thread ${message.channel.id} has no Unthread ticket mapping, skipping`);
      }
    } catch (error) {
      LogEngine.error("Error sending message to Unthread:", error);
      // Consider adding error notification to the thread in production environments
    }
  }

  // Process legacy commands (prefix-based)
  await handleLegacyCommands(message);
}

/**
 * Handles legacy prefix-based commands
 * 
 * These commands start with !! and provide basic bot functionality for
 * diagnostics and information purposes. The commands are simple text triggers
 * that don't require slash command infrastructure.
 * 
 * Available commands:
 * - !!ping: Check bot latency (useful for connectivity troubleshooting)
 * - !!version: Display bot version (useful for verifying deployments)
 * 
 * @param {Message} message - The Discord message object
 * @returns {Promise<void>} - No return value
 * 
 * @debug
 * If commands aren't working:
 * 1. Check the message content exactly matches the command string (!!ping or !!version)
 * 2. Verify the bot has permission to send messages in the channel
 * 3. Ensure the package.json version is correctly defined
 */
async function handleLegacyCommands(message: Message): Promise<void> {
  // Check ping - useful for verifying bot responsiveness and connection quality
  if (message.content === "!!ping") {
    const latency = Date.now() - message.createdTimestamp;
    await message.reply(`Latency is ${latency}ms.`);
    LogEngine.info(`Responded to ping command with latency ${latency}ms`);
  }

  // Check version - helps track which bot version is running in production
  if (message.content === "!!version") {
    await message.reply(`Version: ${version}`);
    LogEngine.info(`Responded to version command with version ${version}`);
  }
}