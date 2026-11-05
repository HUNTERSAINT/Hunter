import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { upsertMember } from "../services/members.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const MAX_WATCHES = 25;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Follow a project to get alerts about its new opportunities (leave empty to list your watchlist)")
    .addStringOption((o) =>
      o.setName("project").setDescription("Project name").setMaxLength(100),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await upsertMember(interaction.user.id, interaction.user.username);
    const project = interaction.options.getString("project")?.trim();

    if (!project) {
      const watches = await prisma.watch.findMany({
        where: { memberId: member.id },
        orderBy: { createdAt: "desc" },
        take: MAX_WATCHES,
      });
      await interaction.editReply(
        watches.length === 0
          ? "You're not watching any projects yet. Use `/watch project:<name>` to follow one."
          : `You're watching ${watches.length} project${watches.length === 1 ? "" : "s"}:\n${watches.map((w) => `• ${w.projectName}`).join("\n")}`,
      );
      return;
    }

    const slug = slugify(project);
    if (!slug) {
      await interaction.editReply("I couldn't understand that project name.");
      return;
    }

    const existing = await prisma.watch.findUnique({
      where: { memberId_projectSlug: { memberId: member.id, projectSlug: slug } },
    });
    if (!existing) {
      const count = await prisma.watch.count({ where: { memberId: member.id } });
      if (count >= MAX_WATCHES) {
        await interaction.editReply(`You can watch up to ${MAX_WATCHES} projects. Use \`/unwatch\` to free a spot.`);
        return;
      }
      await prisma.watch.create({
        data: { memberId: member.id, projectSlug: slug, projectName: project },
      });
    }

    const researched = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
    await interaction.editReply(
      `You're watching **${project}**. I'll message you when a new job, ambassador program, bounty or grant from it is announced, or when one reopens.` +
        (researched ? "" : " Run `/research` on it to build up its profile."),
    );
  },
};

export default command;
