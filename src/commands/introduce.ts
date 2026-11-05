import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { sendToChannel } from "../discordUtils.js";
import { channelMap, getGuildSettings } from "../services/guild.js";
import { upsertMember } from "../services/members.js";
import { awardPointsOnce } from "../services/points.js";
import { clip } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("introduce")
    .setDescription("Introduce yourself to the community")
    .addStringOption((o) =>
      o.setName("text").setDescription("Who you are, what you do and what you're looking for").setRequired(true).setMaxLength(500),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const text = interaction.options.getString("text", true).trim();

    const member = await upsertMember(interaction.user.id, interaction.user.username);
    const updated = await prisma.member.update({ where: { id: member.id }, data: { introduction: text } });
    const firstTime = await awardPointsOnce(member.id, 5, "Posted an introduction");

    const channelId = interaction.guildId
      ? channelMap(await getGuildSettings(interaction.guildId)).networking
      : undefined;

    let posted = false;
    if (channelId) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("👋 New introduction")
        .setDescription(`<@${interaction.user.id}>\n\n${clip(text, 500)}`);
      if (updated.skills.length > 0) embed.addFields({ name: "Skills", value: clip(updated.skills.join(", "), 1024) });
      if (updated.preferredRoles.length > 0) embed.addFields({ name: "Looking for", value: clip(updated.preferredRoles.join(", "), 1024) });
      posted = await sendToChannel(interaction.client, channelId, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    await interaction.editReply(
      `Introduction saved${posted ? ` and posted in <#${channelId}>` : ""}.` +
        (firstTime ? " You earned 5 community points." : "") +
        (posted || channelId ? "" : " Ask an admin to set a networking channel with `/admin config channel` so introductions get posted."),
    );
  },
};

export default command;
