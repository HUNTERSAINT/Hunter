import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { generateKol } from "../ai/creator.js";
import { consumeAssist } from "../limits.js";
import { adminOnly, deliver, guarded } from "./creatorKit.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("kol")
    .setDescription("Full KOL package for a project: verdict, article, thread, covers, playbook, Notion row (admins)")
    .addStringOption((o) => o.setName("project").setDescription("Project name").setRequired(true).setMaxLength(200))
    .addStringOption((o) =>
      o.setName("links").setDescription("Website, Telegram, X, docs, application link (any order)").setMaxLength(1000),
    )
    .addStringOption((o) => o.setName("notes").setDescription("Extra notes from you").setMaxLength(500)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!(await adminOnly(interaction))) return;
    const limit = await consumeAssist(interaction.user.id);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }
    const project = interaction.options.getString("project", true).trim();
    await interaction.editReply(`Researching **${project}** and writing the package. This takes a minute or two.`);
    await guarded(interaction, "kol", async () => {
      const text = await generateKol({
        project,
        links: interaction.options.getString("links") ?? undefined,
        notes: interaction.options.getString("notes") ?? undefined,
      });
      await deliver(interaction, `KOL package: ${project}`, text);
    });
  },
};

export default command;
