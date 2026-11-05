import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { clip } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("members")
    .setDescription("Find community members by skill, for collaboration and networking")
    .addStringOption((o) => o.setName("skill").setDescription("e.g. solidity, design, writing").setRequired(true).setMaxLength(40))
    .addStringOption((o) => o.setName("ecosystem").setDescription("Optional ecosystem, e.g. solana").setMaxLength(40)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const skill = interaction.options.getString("skill", true).trim().toLowerCase();
    const ecosystem = interaction.options.getString("ecosystem")?.trim().toLowerCase();

    const found = await prisma.member.findMany({
      where: {
        discoverable: true,
        discordId: { not: interaction.user.id },
        skills: { has: skill },
        ...(ecosystem ? { ecosystems: { has: ecosystem } } : {}),
      },
      orderBy: { points: "desc" },
      take: 10,
    });

    if (found.length === 0) {
      await interaction.editReply(
        "No members found. Only people who turned on `discoverable` in `/profile set` appear here, and skills must match exactly (for example `solidity`).",
      );
      return;
    }

    const lines = found.map(
      (m) =>
        `<@${m.discordId}>${m.experienceLevel ? ` · ${m.experienceLevel}` : ""}\n${clip(m.skills.join(", "), 120)}${m.portfolioUrl ? `\n[Portfolio](${m.portfolioUrl})` : ""}`,
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`Members with ${skill}`)
          .setDescription(clip(lines.join("\n\n"), 4000))
          .setFooter({ text: "Only members who chose to be discoverable are listed" }),
      ],
    });
  },
};

export default command;
