import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { CONTENT_FORMATS, generateContent, type ContentFormat } from "../ai/content.js";
import { reportSchema } from "../ai/schema.js";
import { prisma } from "../db.js";
import { replyLong } from "../discordUtils.js";
import { consumeAssist, consumeQuota, refundQuota } from "../limits.js";
import { reportError } from "../monitoring.js";
import { researchEnabled, resolveChannelId } from "../services/guild.js";
import { queueRequest } from "../services/requests.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("content")
    .setDescription("Generate original content ideas about a project to get noticed by its team")
    .addStringOption((o) =>
      o.setName("project").setDescription("Project name or link").setRequired(true).setMaxLength(200),
    )
    .addStringOption((o) =>
      o
        .setName("format")
        .setDescription("What to create")
        .setRequired(true)
        .addChoices(...Object.entries(CONTENT_FORMATS).map(([value, f]) => ({ name: f.label, value }))),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString("project", true).trim();
    const format = interaction.options.getString("format", true) as ContentFormat;
    const guildId = interaction.guildId;

    const project = await prisma.project.findUnique({ where: { slug: slugify(query) } });
    const parsed = project ? reportSchema.safeParse(project.report) : null;

    // Content is built from saved research, so research the project first if it has none.
    if (!parsed || !parsed.success) {
      if (!(await researchEnabled(guildId))) {
        await interaction.editReply(
          `I don't have research on **${query}** yet, and research is turned off on this server.`,
        );
        return;
      }
      const limit = await consumeQuota(interaction.user.id, 1, guildId);
      if (!limit.ok) {
        await interaction.editReply(limit.reason);
        return;
      }
      const channelId = await resolveChannelId(guildId, "research", interaction.channelId);
      try {
        await queueRequest({
          kind: "RESEARCH",
          query,
          channelId,
          discordId: interaction.user.id,
          username: interaction.user.username,
        });
      } catch (err) {
        reportError(err, { command: "content" });
        await refundQuota(interaction.user.id, 1);
        await interaction.editReply("I couldn't queue the research. Please try again in a moment.");
        return;
      }
      await interaction.editReply(
        `I haven't researched **${query}** yet, so I've started that. Run \`/content\` again once the report is posted in <#${channelId}>.`,
      );
      return;
    }

    const limit = await consumeAssist(interaction.user.id);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }

    const text = await generateContent(format, parsed.data);
    await replyLong(
      interaction,
      `**${CONTENT_FORMATS[format].label}: ${parsed.data.projectName}**\n\n${text}`,
    );
  },
};

export default command;
