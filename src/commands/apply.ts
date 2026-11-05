import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { ASSIST_KINDS, generateAssistance, type AssistKind } from "../ai/assistant.js";
import { reportSchema } from "../ai/schema.js";
import { prisma } from "../db.js";
import { replyLong } from "../discordUtils.js";
import { consumeAssist } from "../limits.js";
import { slugify } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Get an AI draft for an application, outreach message or interview prep")
    .addStringOption((o) =>
      o
        .setName("kind")
        .setDescription("What to prepare")
        .setRequired(true)
        .addChoices(...Object.entries(ASSIST_KINDS).map(([value, k]) => ({ name: k.label, value }))),
    )
    .addStringOption((o) =>
      o
        .setName("target")
        .setDescription("Project name, role, or a listing number like #12")
        .setRequired(true)
        .setMaxLength(200),
    )
    .addStringOption((o) =>
      o
        .setName("details")
        .setDescription("Job description, CV text or anything else the draft should use")
        .setMaxLength(4000),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const kind = interaction.options.getString("kind", true) as AssistKind;
    const target = interaction.options.getString("target", true).trim();
    const details = interaction.options.getString("details")?.trim() ?? "";

    const limit = await consumeAssist(interaction.user.id);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }

    const refMatch = target.match(/^#?(\d{1,9})$/);
    const opportunity = refMatch
      ? await prisma.opportunity.findFirst({ where: { ref: Number(refMatch[1]), status: "APPROVED" } })
      : null;
    if (refMatch && !opportunity) {
      await interaction.editReply(`I couldn't find listing #${refMatch[1]}. Check the number or type the project name instead.`);
      return;
    }

    const member = await prisma.member.findUnique({ where: { discordId: interaction.user.id } });
    const project = await prisma.project.findUnique({
      where: { slug: slugify(opportunity?.projectName ?? target) },
    });
    const parsed = project ? reportSchema.safeParse(project.report) : null;

    const text = await generateAssistance({
      kind,
      member,
      target: opportunity ? `${opportunity.title} at ${opportunity.projectName}` : target,
      opportunity,
      details,
      research: parsed?.success ? parsed.data : null,
    });

    const hint = member ? "" : "\n\n_Tip: save your skills and background with `/profile set` for a more personal draft._";
    await replyLong(
      interaction,
      `**${ASSIST_KINDS[kind].label}**\n\n${text}\n\n_AI draft. Check every fact before you send it._${hint}`,
    );
  },
};

export default command;
