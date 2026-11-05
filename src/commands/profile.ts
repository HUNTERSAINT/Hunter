import type { Prisma } from "@prisma/client";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { clip, isHttpUrl, parseList } from "../utils.js";
import type { Command } from "./types.js";

const dash = (value: string | null | undefined) => value || "Not set";
const list = (values: string[]) => (values.length > 0 ? values.join(", ") : "Not set");

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Create, update or view your member profile")
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Create or update your profile (only the fields you fill in are changed)")
        .addStringOption((o) => o.setName("skills").setDescription("Comma-separated, e.g. solidity, react, technical writing"))
        .addStringOption((o) =>
          o
            .setName("level")
            .setDescription("Experience level")
            .addChoices(
              { name: "Entry level", value: "entry" },
              { name: "Junior", value: "junior" },
              { name: "Mid level", value: "mid" },
              { name: "Senior", value: "senior" },
            ),
        )
        .addStringOption((o) => o.setName("roles").setDescription("Preferred roles, comma-separated"))
        .addStringOption((o) => o.setName("ecosystems").setDescription("Blockchain ecosystems you like, comma-separated"))
        .addStringOption((o) => o.setName("portfolio").setDescription("Portfolio link (https://...)"))
        .addStringOption((o) => o.setName("github").setDescription("GitHub profile link (https://...)"))
        .addStringOption((o) =>
          o
            .setName("arrangement")
            .setDescription("Preferred work arrangement")
            .addChoices(
              { name: "Remote", value: "remote" },
              { name: "Hybrid", value: "hybrid" },
              { name: "On-site", value: "onsite" },
            ),
        )
        .addStringOption((o) => o.setName("salary").setDescription("Salary expectation, free text").setMaxLength(100))
        .addStringOption((o) =>
          o.setName("cv").setDescription("Paste your CV or a short background (used only for your own /apply drafts)").setMaxLength(4000),
        )
        .addBooleanOption((o) =>
          o.setName("discoverable").setDescription("Let other members find you with /members (shows your skills and level)"),
        ),
    )
    .addSubcommand((s) => s.setName("view").setDescription("View your profile")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const discordId = interaction.user.id;

    if (interaction.options.getSubcommand() === "set") {
      const o = interaction.options;
      const portfolio = o.getString("portfolio");
      const github = o.getString("github");

      for (const [label, value] of [["portfolio", portfolio], ["github", github]] as const) {
        if (value && !isHttpUrl(value)) {
          await interaction.editReply(`The ${label} link must start with http:// or https://.`);
          return;
        }
      }

      const data: Prisma.MemberUpdateInput = { username: interaction.user.username };
      const skills = o.getString("skills");
      const roles = o.getString("roles");
      const ecosystems = o.getString("ecosystems");
      if (skills) data.skills = parseList(skills).map((s) => s.toLowerCase());
      if (roles) data.preferredRoles = parseList(roles).map((s) => s.toLowerCase());
      if (ecosystems) data.ecosystems = parseList(ecosystems).map((s) => s.toLowerCase());
      if (o.getString("level")) data.experienceLevel = o.getString("level");
      if (portfolio) data.portfolioUrl = portfolio;
      if (github) data.githubUrl = github;
      if (o.getString("arrangement")) data.workArrangement = o.getString("arrangement");
      if (o.getString("salary")) data.salaryExpectation = o.getString("salary");
      if (o.getString("cv")) data.cvText = o.getString("cv");
      const discoverable = o.getBoolean("discoverable");
      if (discoverable !== null) data.discoverable = discoverable;

      await prisma.member.upsert({ where: { discordId }, create: { discordId }, update: {} });
      await prisma.member.update({ where: { discordId }, data });
      await interaction.editReply("Profile saved. Use `/profile view` to see it. Only you can see your profile.");
      return;
    }

    const member = await prisma.member.findUnique({ where: { discordId } });
    if (!member) {
      await interaction.editReply("You don't have a profile yet. Create one with `/profile set`.");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${interaction.user.username}'s profile`)
      .addFields(
        { name: "Skills", value: clip(list(member.skills), 1024) },
        { name: "Experience level", value: dash(member.experienceLevel), inline: true },
        { name: "Work arrangement", value: dash(member.workArrangement), inline: true },
        { name: "Salary expectation", value: dash(member.salaryExpectation), inline: true },
        { name: "Preferred roles", value: clip(list(member.preferredRoles), 1024) },
        { name: "Ecosystems", value: clip(list(member.ecosystems), 1024) },
        { name: "Portfolio", value: dash(member.portfolioUrl), inline: true },
        { name: "GitHub", value: dash(member.githubUrl), inline: true },
        { name: "CV saved", value: member.cvText ? "Yes" : "No", inline: true },
        { name: "Findable by other members", value: member.discoverable ? "Yes" : "No", inline: true },
        { name: "Community points", value: String(member.points), inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
