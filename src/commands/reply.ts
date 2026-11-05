import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { generateReplies } from "../ai/creator.js";
import { consumeAssist } from "../limits.js";
import { adminOnly, deliver, guarded } from "./creatorKit.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("reply")
    .setDescription("Reply options for a tweet: best reply, quote idea, punchy, curious, funny, bold (admins)")
    .addStringOption((o) => o.setName("tweet").setDescription("Paste the tweet text").setRequired(true).setMaxLength(1500)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!(await adminOnly(interaction))) return;
    const limit = await consumeAssist(interaction.user.id);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }
    await guarded(interaction, "reply", async () => {
      const text = await generateReplies(interaction.options.getString("tweet", true));
      await deliver(interaction, "Reply pack", text);
    });
  },
};

export default command;
