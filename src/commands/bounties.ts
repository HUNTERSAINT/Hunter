import type { RewardType } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { runBrowse } from "./browse.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("bounties")
    .setDescription("Discover bounties and paid gigs")
    .addStringOption((o) =>
      o
        .setName("reward")
        .setDescription("Type of reward")
        .addChoices(
          { name: "Cash", value: "CASH" },
          { name: "Token", value: "TOKEN" },
          { name: "Points", value: "POINTS" },
          { name: "Grant", value: "GRANT" },
          { name: "Unpaid (exposure only)", value: "UNPAID" },
        ),
    )
    .addStringOption((o) =>
      o.setName("keywords").setDescription("e.g. writing, design, translation, bug bounty").setMaxLength(100),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reward = interaction.options.getString("reward") as RewardType | null;
    await runBrowse(
      interaction,
      {
        types: ["BOUNTY"],
        q: interaction.options.getString("keywords")?.trim() || undefined,
        rewardType: reward ?? undefined,
        limit: 8,
      },
      "Open bounties and gigs",
    );
  },
};

export default command;
