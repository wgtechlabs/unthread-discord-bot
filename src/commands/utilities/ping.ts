import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';

/**
 * Ping Command
 * 
 * Provides diagnostic information about the bot's connection to Discord.
 * Displays two metrics:
 * - API Latency: Measures the time taken for a round-trip interaction with Discord.
 * - WebSocket Heartbeat: Indicates the current ping to Discord's gateway.
 * 
 * @module commands/utilities/ping
 */
export const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows bot latency and API ping metrics.');

/**
 * Executes the ping command.
 * 
 * @async
 * @param {CommandInteraction} interaction - The interaction object from Discord.js.
 * @returns {Promise<void>}
 * 
 * Implementation Details:
 * - Uses `deferReply` to measure API latency accurately.
 * - Calculates round-trip latency and retrieves WebSocket heartbeat.
 * - Sends results in an embedded message for better readability.
 */
export async function execute(interaction: CommandInteraction): Promise<void> {
    // Defer the reply to calculate API latency accurately.
    const sent = await interaction.deferReply({ fetchReply: true });
    
    // Calculate the API latency (round-trip time).
    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
    
    // Retrieve the WebSocket heartbeat from the client.
    const wsHeartbeat = interaction.client.ws.ping;
    
    // Create an embed to display the latency metrics.
    const embed = new EmbedBuilder()
        .setColor(0xEB1A1A) // Red color for emphasis. #EB1A1A
        .setTitle('🏓 Pong!')
        .addFields(
            { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
            { name: 'WebSocket Heartbeat', value: `${wsHeartbeat}ms`, inline: true }
        )
        .setFooter({ text: 'Discord Bot Latency Metrics' })
        .setTimestamp();
    
    // Edit the deferred reply to include the embed with metrics.
    await interaction.editReply({ embeds: [embed] });
}