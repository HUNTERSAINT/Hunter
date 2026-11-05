import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top contributors by community points")
    .addStringOption((o) =>
      o
        .setName("period")
        .setDescription("Time range")
        .addChoices({ name: "All time", value: "all" }, { name: "This week", value: "week" }),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const week = interaction.options.getString("period") === "week";

    let rows: { discordId: string; points: number }[];
    if (week) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const groups = await prisma.pointEvent.groupBy({
        by: ["memberId"],
        where: { createdAt: { gte: since }, points: { gt: 0 } },
        _sum: { points: true },
        orderBy: { _sum: { points: "desc" } },
        take: 10,
      });
      const members = await prisma.member.findMany({ where: { id: { in: groups.map((g) => g.memberId) } } });
      const byId = new Map(members.map((m) => [m.id, m]));
      rows = groups.flatMap((g) => {
        const member = byId.get(g.memberId);
        return member ? [{ discordId: member.discordId, points: g._sum.points ?? 0 }] : [];
      });
    } else {
      const top = await prisma.member.findMany({ where: { points: { gt: 0 } }, orderBy: { points: "desc" }, take: 10 });
      rows = top.map((m) => ({ discordId: m.discordId, points: m.points }));
    }

    if (rows.length === 0) {
      await interaction.editReply("No points earned yet. Research projects, share verified opportunities and introduce yourself to get started.");
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.discordId}>: ${r.points} points`);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(week ? "Top contributors this week" : "Top contributors")
          .setDescription(lines.join("\n"))
          .setFooter({ text: "Points: +2 fresh research, +5 introduction, +10 approved shared opportunity, plus admin awards" }),
      ],
    });
  },
};

export default command;
