import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder().setName("help").setDescription("Show what Web3 Job Hunters AI can do"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Web3 Job Hunters AI")
      .setDescription(
        "Discover a project, research it, find opportunities, apply and track the outcome. Type `/menu` to get every command as a button.",
      )
      .addFields(
        {
          name: "Research",
          value: [
            "`/research` Full AI research on a project",
            "`/compare` Compare two projects for different contributors",
            "`/projects` Search saved research and see how it changed",
            "`/watch` and `/unwatch` Follow a project for new opportunities",
            "`/trending` What the community is watching",
          ].join("\n"),
        },
        {
          name: "Opportunities",
          value: [
            "`/opportunities` Jobs, programs, bounties and grants (add `refresh` to search the web)",
            "`/jobs` `/ambassadors` `/bounties` Focused searches",
            "`/match` Listings that fit your profile",
            "`/saved` Keep listings for later",
            "`/digest` A summary of what's new",
            "`/share` Share one you found",
          ].join("\n"),
        },
        {
          name: "Career tools",
          value: [
            "`/profile` Your skills, level, roles, links and CV",
            "`/apply` Drafts: cover letters, ambassador answers, DMs, pitches, CV review, interview prep",
            "`/content` Content ideas to get a project's attention",
            "`/track` Applications, deadlines and follow-up reminders",
          ].join("\n"),
        },
        {
          name: "Safety and community",
          value: [
            "`/scamcheck` Check an offer, DM or link for common scam patterns",
            "`/introduce` `/members` `/leaderboard` Meet people and earn points",
            "`/health` Bot status",
          ].join("\n"),
        },
        {
          name: "How to read research",
          value:
            "**Verified** means confirmed by a primary or independent source. **Project claims** are stated by the project and not independently confirmed. Everything here is AI-assisted and can be wrong, so double-check before acting. Never pay to apply or share a seed phrase.",
        },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
