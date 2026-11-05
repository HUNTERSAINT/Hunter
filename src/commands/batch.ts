import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { generateBatch } from "../ai/creator.js";
import { consumeAssist } from "../limits.js";
import { adminOnly, deliver, guarded } from "./creatorKit.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("batch")
    .setDescription("A fresh scheduled X content pack: trading + Web3 posts with WAT times and 10 replies each (admins)")
    .addIntegerOption((o) =>
      o.setName("days").setDescription("How many days (1 to 3, default 1)").setMinValue(1).setMaxValue(3),
    )
    .addStringOption((o) =>
      o
        .setName("focus")
        .setDescription("What to lean toward")
        .addChoices(
          { name: "Balanced", value: "balanced" },
          { name: "Trading heavy", value: "trading" },
          { name: "Web3 heavy", value: "web3" },
        ),
    )
    .addStringOption((o) => o.setName("notes").setDescription("Anything specific to include or avoid").setMaxLength(500)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!(await adminOnly(interaction))) return;
    const limit = await consumeAssist(interaction.user.id);
    if (!limit.ok) {
      await interaction.editReply(limit.reason);
      return;
    }
    const days = Math.min(3, Math.max(1, interaction.options.getInteger("days") ?? 1));
    const raw = (interaction.options.getString("focus") ?? "balanced").toLowerCase();
    const focus = raw.includes("trad") ? "trading" : raw.includes("web") ? "web3" : "balanced";

    await interaction.editReply(`Checking what's trending and writing ${days} day${days > 1 ? "s" : ""} of posts. This takes a few minutes.`);
    await guarded(interaction, "batch", async () => {
      const { text, notes } = await generateBatch({
        discordId: interaction.user.id,
        days,
        focus,
        notes: interaction.options.getString("notes") ?? undefined,
      });
      await deliver(interaction, `Content batch (${days} day${days > 1 ? "s" : ""})`, notes.length ? `${text}\n\n⚠️ ${notes.join(" ")}` : text);
    });
  },
};

export default command;
