import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { analyzeText, type Risk } from "../security/scam.js";
import { clip, isHttpUrl } from "../utils.js";
import type { Command } from "./types.js";

const COLORS: Record<Risk, number> = { none: 0x57f287, low: 0xfee75c, medium: 0xe67e22, high: 0xed4245 };
const TITLES: Record<Risk, string> = {
  none: "No warning signs found",
  low: "Low risk: 1 warning sign",
  medium: "Medium risk",
  high: "High risk",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("scamcheck")
    .setDescription("Check a job offer, DM or link for common Web3 scam patterns")
    .addStringOption((o) =>
      o.setName("message").setDescription("Paste the offer, DM or announcement").setRequired(true).setMaxLength(4000),
    )
    .addStringOption((o) => o.setName("link").setDescription("A link to check as well")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = interaction.options.getString("message", true);
    const link = interaction.options.getString("link");

    if (link && !isHttpUrl(link)) {
      await interaction.editReply("The link must start with http:// or https://.");
      return;
    }

    const result = analyzeText(message, link ? [link] : []);
    const embed = new EmbedBuilder()
      .setColor(COLORS[result.risk])
      .setTitle(`🛡️ ${TITLES[result.risk]}`)
      .setDescription(result.summary);

    if (result.findings.length > 0) {
      embed.addFields({
        name: `What I noticed (confidence: ${result.confidence})`,
        value: clip(result.findings.slice(0, 8).map((f) => `• ${f.label}: "${f.evidence}"`).join("\n"), 1024),
      });
    }
    embed.addFields({
      name: "Stay safe",
      value:
        "Real employers never ask you to pay to apply, share a seed phrase or private key, or send crypto first. Confirm every offer on the project's official website, and be careful with recruiters who only use private chat apps.",
    });
    embed.setFooter({ text: "Automated check based on known patterns. It can miss scams and can flag honest posts." });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
