import type { Client } from "discord.js";
import { prisma } from "../db.js";
import { sendDm, sendToChannel } from "../discordUtils.js";
import { opportunityEmbed } from "../opportunityEmbeds.js";
import { channelMap } from "../services/guild.js";
import { discordDate } from "../utils.js";
import { announceNewOpportunities, CHANNEL_FOR_TYPE } from "./announce.js";

const HOUR = 60 * 60 * 1000;

/**
 * Hourly housekeeping: closes expired listings, announces new approved ones, warns about listings
 * that are closing soon, and reminds members about application deadlines and follow-ups.
 */
export async function runReminders(client: Client): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * HOUR);

  await prisma.opportunity.updateMany({
    where: { isOpen: true, deadline: { lt: now } },
    data: { isOpen: false },
  });

  await announceNewOpportunities(client);

  // Listings closing within 48 hours: post once to the channel and message members who saved them.
  const closing = await prisma.opportunity.findMany({
    where: { status: "APPROVED", isOpen: true, deadline: { gte: now, lte: soon }, closingNotifiedAt: null },
    take: 25,
  });
  if (closing.length > 0) {
    const guilds = await prisma.guildSettings.findMany({ where: { paused: false } });
    for (const o of closing) {
      const embed = opportunityEmbed(o, { heading: "⏳ Closing soon" });
      for (const guild of guilds) {
        const channelId = channelMap(guild)[CHANNEL_FOR_TYPE[o.type]];
        if (channelId) await sendToChannel(client, channelId, { embeds: [embed] });
      }
      const savers = await prisma.savedOpportunity.findMany({
        where: { opportunityId: o.id },
        include: { member: true },
        take: 100,
      });
      for (const saved of savers) {
        await sendDm(client, saved.member.discordId, {
          content: "⏳ A listing you saved is closing soon:",
          embeds: [embed],
        });
      }
      await prisma.opportunity.update({ where: { id: o.id }, data: { closingNotifiedAt: now } });
    }
  }

  // Application deadlines in the next 48 hours for applications not yet submitted.
  const due = await prisma.application.findMany({
    where: {
      deadline: { gte: now, lte: soon },
      deadlineRemindedAt: null,
      status: { in: ["SAVED", "PREPARING"] },
    },
    include: { member: true },
  });
  for (const app of due) {
    await sendDm(
      client,
      app.member.discordId,
      `⏰ Deadline coming up: **${app.title}** at ${app.company} is due ${app.deadline ? discordDate(app.deadline) : "soon"}. ` +
        `Application #${app.ref} is still marked ${app.status.toLowerCase()}. Use \`/track update id:${app.ref} status:applied\` once you've applied.`,
    );
    await prisma.application.update({ where: { id: app.id }, data: { deadlineRemindedAt: now } });
  }

  // Follow-up reminders for applications that are in progress.
  const followUps = await prisma.application.findMany({
    where: {
      followUpAt: { lte: now },
      followUpRemindedAt: null,
      status: { in: ["APPLIED", "ASSESSMENT", "INTERVIEW"] },
    },
    include: { member: true },
  });
  for (const app of followUps) {
    await sendDm(
      client,
      app.member.discordId,
      `📬 Time to follow up on **${app.title}** at ${app.company} (application #${app.ref}, ${app.status.toLowerCase()}). ` +
        `Use \`/apply\` for a follow-up message and \`/track update\` to log the outcome.`,
    );
    await prisma.application.update({ where: { id: app.id }, data: { followUpRemindedAt: now } });
  }
}
