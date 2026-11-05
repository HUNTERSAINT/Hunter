import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { consumeQuota, refundQuota } from "../limits.js";
import { reportError } from "../monitoring.js";
import { resolveChannelId } from "../services/guild.js";
import { queueRequest } from "../services/requests.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare two Web3 projects for different kinds of contributors")
    .addStringOption((o) =>
      o.setName("project1").setDescription("First project name or link").setRequired(true).setMaxLength(200),
    )
    .addStringOption((o) =>
      o.setName("project2").setDescription("Second project name or link").setRequired(true).setMaxLength(200),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const a = interaction.options.getString("project1", true).trim();
    const b = interaction.options.getString("project2", true).trim();

    const slugA = slugify(a);
    const slugB = slugify(b);
    if (!slugA || !slugB) {
      await interaction.editReply("I couldn't understand one of those project names or links.");
      return;
    }
    if (slugA === slugB) {
      await interaction.editReply("Please pick two different projects to compare.");
      return;
    }

    // A comparison may need two fresh research runs, so it counts as two toward the daily quota.
    const limit = await consumeQuota(interaction.user.id, 2, interaction.guildId);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }

    const channelId = await resolveChannelId(interaction.guildId, "analysis", interaction.channelId);

    try {
      await queueRequest({
        kind: "COMPARE",
        query: a,
        queryB: b,
        channelId,
        discordId: interaction.user.id,
        username: interaction.user.username,
      });
    } catch (err) {
      reportError(err, { command: "compare" });
      await refundQuota(interaction.user.id, 2);
      await interaction.editReply("I couldn't queue that request. Please try again in a moment.");
      return;
    }

    await interaction.editReply(
      `Comparing **${a}** and **${b}**. I'll post the result in <#${channelId}> when it's ready. Projects I haven't researched yet are researched first, so this can take a few minutes.`,
    );
  },
};

export default command;
