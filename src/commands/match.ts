import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { rankOpportunities } from "../services/match.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Match open opportunities to your profile"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await prisma.member.findUnique({ where: { discordId: interaction.user.id } });
    if (!member || (member.skills.length === 0 && member.preferredRoles.length === 0)) {
      await interaction.editReply(
        "I need your skills or preferred roles to match listings. Add them with `/profile set`.",
      );
      return;
    }

    const candidates = await prisma.opportunity.findMany({
      where: {
        status: "APPROVED",
        isOpen: true,
        OR: [{ deadline: null }, { deadline: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const ranked = rankOpportunities(member, candidates).slice(0, 8);
    const extras = new Map(ranked.map((r) => [r.item.id, `Why: ${r.result.reasons.join(" • ")}`]));

    await interaction.editReply({
      embeds: [
        opportunityListEmbed(
          "Your best matches",
          ranked.map((r) => r.item),
          extras,
          "Nothing matches your profile yet. Try adding more skills or roles with `/profile set`, or check back after the next scan.",
        ),
      ],
    });
  },
};

export default command;
