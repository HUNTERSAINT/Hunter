import type { OpportunityType } from "@prisma/client";
import type { Client } from "discord.js";
import { prisma } from "../db.js";
import { sendDm, sendToChannel } from "../discordUtils.js";
import { opportunityEmbed } from "../opportunityEmbeds.js";
import { channelMap, type ChannelKey } from "../services/guild.js";

export const CHANNEL_FOR_TYPE: Record<OpportunityType, ChannelKey> = {
  JOB: "jobs",
  AMBASSADOR: "ambassadors",
  BOUNTY: "bounties",
  GRANT: "ambassadors",
};

/**
 * Posts approved listings that have not been announced yet to each server's channel for that type,
 * and messages members who are watching the project. Returns how many listings were announced.
 */
export async function announceNewOpportunities(client: Client): Promise<number> {
  const fresh = await prisma.opportunity.findMany({
    where: { status: "APPROVED", isOpen: true, notifiedAt: null },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  if (fresh.length === 0) return 0;

  const guilds = await prisma.guildSettings.findMany({ where: { paused: false } });

  for (const o of fresh) {
    const embed = opportunityEmbed(o);

    for (const guild of guilds) {
      const channelId = channelMap(guild)[CHANNEL_FOR_TYPE[o.type]];
      if (channelId) await sendToChannel(client, channelId, { embeds: [embed] });
    }

    const watchers = await prisma.watch.findMany({
      where: { projectSlug: o.projectSlug },
      include: { member: true },
      take: 100,
    });
    for (const watcher of watchers) {
      await sendDm(client, watcher.member.discordId, {
        content: `📌 New opportunity from **${o.projectName}**, a project you're watching:`,
        embeds: [embed],
      });
    }

    await prisma.opportunity.update({ where: { id: o.id }, data: { notifiedAt: new Date() } });
  }
  return fresh.length;
}
