import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { rankOpportunities } from "../services/match.js";
import type { Command } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("digest")
    .setDescription("A summary of new opportunities, tailored to your profile when you have one")
    .addStringOption((o) =>
      o
        .setName("period")
        .setDescription("How far back to look")
        .setRequired(true)
        .addChoices({ name: "Last 24 hours", value: "daily" }, { name: "Last 7 days", value: "weekly" }),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const weekly = interaction.options.getString("period", true) === "weekly";
    const since = new Date(Date.now() - (weekly ? 7 : 1) * DAY);

    const fresh = await prisma.opportunity.findMany({
      where: { status: "APPROVED", isOpen: true, createdAt: { gte: since } },
      orderBy: [{ verified: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    const member = await prisma.member.findUnique({ where: { discordId: interaction.user.id } });
    const personal = member && (member.skills.length > 0 || member.preferredRoles.length > 0);

    const picked = personal
      ? rankOpportunities(member, fresh).slice(0, 10).map((r) => r.item)
      : fresh.slice(0, 10);

    await interaction.editReply({
      content: `${fresh.length} new listing${fresh.length === 1 ? "" : "s"} in the last ${weekly ? "7 days" : "24 hours"}${personal ? `, ${picked.length} matching your profile` : ""}.`,
      embeds: [
        opportunityListEmbed(
          weekly ? "Your weekly digest" : "Your daily digest",
          picked,
          undefined,
          personal
            ? "Nothing new matches your profile in this period."
            : "Nothing new in this period. Save your skills with `/profile set` to get tailored digests.",
        ),
      ],
    });
  },
};

export default command;
