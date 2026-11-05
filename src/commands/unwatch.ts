import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("unwatch")
    .setDescription("Stop following a project")
    .addStringOption((o) =>
      o.setName("project").setDescription("Project name").setRequired(true).setMaxLength(100),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const project = interaction.options.getString("project", true).trim();
    const member = await prisma.member.findUnique({ where: { discordId: interaction.user.id } });

    const removed = member
      ? await prisma.watch.deleteMany({ where: { memberId: member.id, projectSlug: slugify(project) } })
      : { count: 0 };

    await interaction.editReply(
      removed.count > 0
        ? `You're no longer watching **${project}**.`
        : `You weren't watching **${project}**. Use \`/watch\` with no project to see your list.`,
    );
  },
};

export default command;
