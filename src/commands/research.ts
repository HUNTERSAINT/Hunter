import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { consumeQuota, refundQuota } from "../limits.js";
import { reportError } from "../monitoring.js";
import { resolveChannelId } from "../services/guild.js";
import { queueRequest } from "../services/requests.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("research")
    .setDescription("Research a Web3 project: team, funding, tech, security and ways to get involved")
    .addStringOption((o) =>
      o
        .setName("project")
        .setDescription("Project name, website, X profile or docs link")
        .setRequired(true)
        .setMaxLength(200),
    )
    .addBooleanOption((o) =>
      o.setName("refresh").setDescription("Ignore saved research and run it again"),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString("project", true).trim();
    const refresh = interaction.options.getBoolean("refresh") ?? false;

    if (!slugify(query)) {
      await interaction.editReply("I couldn't understand that project name or link. Try the project's name or website.");
      return;
    }

    const limit = await consumeQuota(interaction.user.id, 1, interaction.guildId);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }

    const channelId = await resolveChannelId(interaction.guildId, "research", interaction.channelId);

    try {
      await queueRequest({
        kind: "RESEARCH",
        query,
        force: refresh,
        channelId,
        discordId: interaction.user.id,
        username: interaction.user.username,
      });
    } catch (err) {
      reportError(err, { command: "research" });
      await refundQuota(interaction.user.id, 1);
      await interaction.editReply("I couldn't queue that request. Please try again in a moment.");
      return;
    }

    await interaction.editReply(
      `Researching **${query}** now. I'll post the report in <#${channelId}> when it's ready, usually within a few minutes.`,
    );
  },
};

export default command;
