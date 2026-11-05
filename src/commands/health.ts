import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { researchQueue } from "../queue.js";
import { redis } from "../redis.js";
import type { Command } from "./types.js";

async function timed(fn: () => Promise<unknown>): Promise<string> {
  const start = Date.now();
  try {
    await fn();
    return `✅ ${Date.now() - start} ms`;
  } catch {
    return "❌ unreachable";
  }
}

const command: Command = {
  data: new SlashCommandBuilder().setName("health").setDescription("Check bot status"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [database, cache] = await Promise.all([
      timed(() => prisma.$queryRaw`SELECT 1`),
      timed(() => redis.ping()),
    ]);

    let queue = "❌ unreachable";
    try {
      const counts = await researchQueue.getJobCounts("waiting", "active", "delayed", "failed");
      queue = `${counts.waiting} waiting • ${counts.active} running • ${counts.failed} failed`;
    } catch {
      // leave as unreachable
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Bot status")
      .addFields(
        { name: "Discord", value: `✅ ${interaction.client.ws.ping} ms`, inline: true },
        { name: "Database", value: database, inline: true },
        { name: "Redis", value: cache, inline: true },
        { name: "Research queue", value: queue },
        { name: "Uptime", value: `${Math.floor(process.uptime() / 60)} min` },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
