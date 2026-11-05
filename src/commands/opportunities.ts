import type { OpportunityType } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { consumeQuota, refundQuota } from "../limits.js";
import { reportError } from "../monitoring.js";
import { researchEnabled, resolveChannelId } from "../services/guild.js";
import { queueRequest } from "../services/requests.js";
import { runBrowse } from "./browse.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("opportunities")
    .setDescription("Find Web3 jobs, ambassador programs, bounties and grants")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Kind of opportunity")
        .addChoices(
          { name: "Jobs", value: "JOB" },
          { name: "Ambassador and contributor programs", value: "AMBASSADOR" },
          { name: "Bounties and gigs", value: "BOUNTY" },
          { name: "Grants", value: "GRANT" },
        ),
    )
    .addStringOption((o) =>
      o.setName("topic").setDescription("Keywords, e.g. solidity, writing, design").setMaxLength(100),
    )
    .addBooleanOption((o) =>
      o.setName("refresh").setDescription("Also search the web for new listings (uses your daily research quota)"),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const type = interaction.options.getString("type") as OpportunityType | null;
    const topic = interaction.options.getString("topic")?.trim() || undefined;
    const refresh = interaction.options.getBoolean("refresh") ?? false;
    let note: string | undefined;

    if (refresh) {
      const guildId = interaction.guildId;
      if (!(await researchEnabled(guildId))) {
        note = "Web refresh is turned off on this server, so these are saved listings only.";
      } else {
        const limit = await consumeQuota(interaction.user.id, 1, guildId);
        if (!limit.ok) {
          note = limit.reason;
        } else {
          const channelId = await resolveChannelId(guildId, "research", interaction.channelId);
          try {
            await queueRequest({
              kind: "DISCOVER",
              query: topic ?? "",
              queryB: type ?? "",
              channelId,
              discordId: interaction.user.id,
              username: interaction.user.username,
            });
            note = `I'm also searching the web for new listings and will post what I find in <#${channelId}>.`;
          } catch (err) {
            reportError(err, { command: "opportunities" });
            await refundQuota(interaction.user.id, 1);
            note = "I couldn't start the web search just now.";
          }
        }
      }
    }

    await runBrowse(
      interaction,
      { types: type ? [type] : undefined, q: topic, limit: 8 },
      "Open opportunities",
      note,
    );
  },
};

export default command;
