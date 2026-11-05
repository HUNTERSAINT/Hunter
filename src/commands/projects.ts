import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { reportSchema } from "../ai/schema.js";
import { prisma } from "../db.js";
import { newRedFlags, newVerifiedItems } from "../services/projects.js";
import { clip, slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("projects")
    .setDescription("Browse research the community has already done")
    .addSubcommand((s) =>
      s
        .setName("search")
        .setDescription("Search researched projects")
        .addStringOption((o) => o.setName("query").setDescription("Name or keyword").setRequired(true).setMaxLength(100)),
    )
    .addSubcommand((s) =>
      s
        .setName("history")
        .setDescription("See how a project's research has changed over time")
        .addStringOption((o) => o.setName("project").setDescription("Project name").setRequired(true).setMaxLength(100)),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.options.getSubcommand() === "search") {
      const query = interaction.options.getString("query", true).trim();
      const found = await prisma.project.findMany({
        where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: slugify(query) } }] },
        orderBy: { researchedAt: "desc" },
        take: 10,
      });
      if (found.length === 0) {
        await interaction.editReply(`No saved research matches "${query}". Start some with \`/research\`.`);
        return;
      }
      const lines = found.map(
        (p) => `**${p.name}** · confidence ${p.overallConfidence ?? "unknown"} · researched ${p.researchedAt.toISOString().slice(0, 10)}\n\`/research project:${p.name}\` shows the full report`,
      );
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Saved research").setDescription(clip(lines.join("\n\n"), 4000))],
      });
      return;
    }

    const input = interaction.options.getString("project", true).trim();
    const project = await prisma.project.findFirst({
      where: { OR: [{ slug: slugify(input) }, { name: { contains: input, mode: "insensitive" } }] },
      include: { snapshots: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    if (!project) {
      await interaction.editReply(`I haven't researched "${input}" yet. Use \`/research\` first.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Research history: ${clip(project.name, 200)}`)
      .addFields({
        name: "Versions saved",
        value: clip(project.snapshots.map((s) => s.createdAt.toISOString().slice(0, 10)).join(", ") || "None", 1024),
      });

    const [latest, previous] = project.snapshots.map((s) => reportSchema.safeParse(s.report));
    if (latest?.success && previous?.success) {
      const funding = newVerifiedItems(previous.data, latest.data, "funding");
      const partners = newVerifiedItems(previous.data, latest.data, "partnerships");
      const flags = newRedFlags(previous.data, latest.data);
      embed.addFields(
        { name: "New verified funding info since the previous version", value: clip(funding.map((f) => `• ${f}`).join("\n") || "None", 1024) },
        { name: "New verified partnerships", value: clip(partners.map((p) => `• ${p}`).join("\n") || "None", 1024) },
        { name: "New red flags", value: clip(flags.map((f) => `• ${f}`).join("\n") || "None", 1024) },
      );
    } else {
      embed.setDescription("Only one version is saved so far. Run `/research` with `refresh:true` later to track changes.");
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
