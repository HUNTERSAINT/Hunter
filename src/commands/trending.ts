import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getTrending } from "../services/trending.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder().setName("trending").setDescription("Projects the community is watching and researching this week"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const trending = await getTrending(7, 10);
    if (trending.length === 0) {
      await interaction.editReply("Nothing is trending yet. Research and watch projects to put them here.");
      return;
    }
    const lines = trending.map(
      (t, i) => `**${i + 1}. ${t.name}**: ${t.watchers} watching, ${t.researches} research request${t.researches === 1 ? "" : "s"} this week`,
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Trending projects")
          .setDescription(lines.join("\n"))
          .setFooter({ text: "Based on activity in this community" }),
      ],
    });
  },
};

export default command;
