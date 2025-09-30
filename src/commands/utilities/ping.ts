import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';

/**
 * Ping Command - Bot Latency Diagnostics
 * 
 * @description 
 * Diagnostic slash command providing real-time connection metrics between the bot
 * and Discord services. Measures API response times and WebSocket heartbeat for
 * troubleshooting connectivity and performance issues.
 * 
 * @module commands/utilities/ping
 * @since 1.0.0
 * 
 * @keyFunctions
 * - execute(): Measures and displays API latency and WebSocket heartbeat metrics
 * 
 * @commonIssues
 * - High API latency: Network congestion or Discord API slowdowns (API >1000ms)
 * - WebSocket heartbeat problems: Gateway connection issues (WS >200ms or N/A)
 * - Timeout errors: Command takes too long to respond due to network issues
 * - Permission errors: Bot lacks permission to respond in channel
 * - Rate limiting: Command used too frequently causing throttling
 * 
 * @troubleshooting
 * - API latency >500ms: Check network connectivity and Discord API status
 * - WebSocket "N/A": Bot gateway connection failed, restart may be needed
 * - Command timeouts: Verify bot has "Use Slash Commands" permission
 * - High latencies consistently: Consider server location relative to Discord
 * - Rate limit errors: Implement cooldowns for diagnostic commands
 * 
 * @performance
 * - Uses deferReply() for accurate latency measurement without timeout
 * - Lightweight operation with minimal resource usage
 * - Real-time metrics reflect current connection quality
 * - Embedded response for improved user experience
 * 
 * @dependencies Discord.js SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction
 * 
 * @example Basic Usage
 * ```typescript
 * // Slash command: /ping
 * // Response: Displays API latency and WebSocket heartbeat in embed
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * // Monitor for performance issues
 * if (apiLatency > 1000) {
 *   LogEngine.warn(`High API latency detected: ${apiLatency}ms`);
 * }
 * ```
 */
export const data = new SlashCommandBuilder()
	.setName('ping')
	.setDescription('Shows bot latency and API ping metrics.');

/**
 * Executes ping command and measures bot performance metrics
 *
 * @async
 * @function execute
 * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
 * @returns {Promise<void>} Resolves after sending latency metrics embed
 *
 * @example
 * ```typescript
 * // Called automatically by Discord.js when /ping command is used
 * // Measures API round-trip time and WebSocket heartbeat
 * ```
 * 
 * @troubleshooting
 * - Defer reply prevents interaction timeout during measurement
 * - API latency calculated from interaction timing difference
 * - WebSocket ping retrieved from client.ws.ping property
 * - N/A displayed when WebSocket connection unavailable
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	// Defer the reply to calculate API latency accurately.
	const sent = await interaction.deferReply({ fetchReply: true });

	// Calculate the API latency (round-trip time).
	const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;

	// Retrieve the WebSocket heartbeat from the client.
	const rawWsPing = interaction.client.ws.ping;
	const wsHeartbeat = rawWsPing > 0 ? `${rawWsPing}ms` : 'N/A';

	// Create an embed to display the latency metrics.
	// Red color for emphasis. #EB1A1A
	const embed = new EmbedBuilder()
		.setColor(0xEB1A1A)
		.setTitle('🏓 Pong!')
		.addFields(
			{ name: 'API Latency', value: `${apiLatency}ms`, inline: true },
			{ name: 'WebSocket Heartbeat', value: wsHeartbeat, inline: true },
		)
		.setFooter({ text: 'Discord Bot Latency Metrics' })
		.setTimestamp();

	// Edit the deferred reply to include the embed with metrics.
	await interaction.editReply({ embeds: [embed] });
}