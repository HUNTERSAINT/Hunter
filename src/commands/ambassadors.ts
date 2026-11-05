import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { runBrowse } from "./browse.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ambassadors")
    .setDescription("Find ambassador, contributor and grant programs")
    .addStringOption((o) =>
      o.setName("keywords").setDescription("e.g. campus, regional, developer advocate, testnet").setMaxLength(100),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runBrowse(
      interaction,
      {
        types: ["AMBASSADOR", "GRANT"],
        q: interaction.options.getString("keywords")?.trim() || undefined,
        limit: 8,
      },
      "Open ambassador, contributor and grant programs",
    );
  },
};

export default command;
