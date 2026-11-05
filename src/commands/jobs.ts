import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { runBrowse } from "./browse.js";
import type { Command } from "./types.js";

const CATEGORIES: Record<string, { label: string; keywords: string[] }> = {
  blockchain: { label: "Blockchain developer", keywords: ["blockchain", "smart contract", "web3 developer"] },
  solidity: { label: "Solidity developer", keywords: ["solidity"] },
  fullstack: { label: "Full-stack developer", keywords: ["full-stack", "full stack", "fullstack"] },
  frontend: { label: "Frontend developer", keywords: ["frontend", "front-end", "front end"] },
  backend: { label: "Backend developer", keywords: ["backend", "back-end", "back end"] },
  community: { label: "Community manager", keywords: ["community"] },
  social: { label: "Social media manager", keywords: ["social media"] },
  content: { label: "Content writer", keywords: ["content", "writer", "copywriter"] },
  research: { label: "Research analyst", keywords: ["research", "analyst"] },
  graphic: { label: "Graphic designer", keywords: ["graphic", "visual design"] },
  product: { label: "Product designer", keywords: ["product design", "ux", "ui designer"] },
  marketing: { label: "Marketing specialist", keywords: ["marketing"] },
  bizdev: { label: "Business development", keywords: ["business development", "partnerships"] },
  growth: { label: "Growth specialist", keywords: ["growth"] },
  support: { label: "Customer support", keywords: ["support", "customer success"] },
  devrel: { label: "Developer relations", keywords: ["developer relations", "devrel", "developer advocate"] },
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("jobs")
    .setDescription("Search saved Web3 job listings")
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("Role category")
        .addChoices(...Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.label, value }))),
    )
    .addStringOption((o) => o.setName("keywords").setDescription("Extra keywords").setMaxLength(100))
    .addBooleanOption((o) => o.setName("remote").setDescription("Remote roles only"))
    .addBooleanOption((o) =>
      o.setName("entry").setDescription("Entry-level or no-degree-required roles only"),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const category = interaction.options.getString("category");
    await runBrowse(
      interaction,
      {
        types: ["JOB"],
        q: interaction.options.getString("keywords")?.trim() || undefined,
        categoryKeywords: category ? CATEGORIES[category]?.keywords : undefined,
        remote: interaction.options.getBoolean("remote") ?? undefined,
        entry: interaction.options.getBoolean("entry") ?? undefined,
        limit: 8,
      },
      category ? `Open jobs: ${CATEGORIES[category]?.label}` : "Open jobs",
    );
  },
};

export default command;
