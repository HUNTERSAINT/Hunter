import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { reportSchema } from "../ai/schema.js";
import { prisma } from "../db.js";
import { sendDm, sendToChannel } from "../discordUtils.js";
import { reportError } from "../monitoring.js";
import { channelMap } from "../services/guild.js";
import { getOrResearch, newRedFlags, newVerifiedItems } from "../services/projects.js";
import { clip } from "../utils.js";

const MAX_PROJECTS_PER_RUN = 5;

/**
 * Re-researches the most-watched projects and tells watchers when new verified funding or
 * partnership facts, or new red flags, appear. Costs a few research runs per week.
 */
export async function refreshWatched(client: Client): Promise<number> {
  const groups = await prisma.watch.groupBy({
    by: ["projectSlug"],
    _count: { _all: true },
    orderBy: { _count: { projectSlug: "desc" } },
    take: MAX_PROJECTS_PER_RUN,
  });

  let notified = 0;
  for (const group of groups) {
    const project = await prisma.project.findUnique({ where: { slug: group.projectSlug } });
    if (!project) continue; // watched but never researched, so there is nothing to compare against

    try {
      const previousParsed = reportSchema.safeParse(project.report);
      const previous = previousParsed.success ? previousParsed.data : null;
      const { report } = await getOrResearch(project.website ?? project.name, true, project.slug);

      const funding = newVerifiedItems(previous, report, "funding");
      const partnerships = newVerifiedItems(previous, report, "partnerships");
      const flags = newRedFlags(previous, report);
      if (funding.length + partnerships.length + flags.length === 0) continue;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📡 Update on ${clip(report.projectName, 200)}`)
        .setFooter({ text: "Found by re-running research. Verify before acting." });
      if (funding.length > 0) {
        embed.addFields({ name: "New verified funding information", value: clip(funding.map((f) => `• ${f}`).join("\n"), 1024) });
      }
      if (partnerships.length > 0) {
        embed.addFields({ name: "New verified partnerships", value: clip(partnerships.map((p) => `• ${p}`).join("\n"), 1024) });
      }
      if (flags.length > 0) {
        embed.addFields({ name: "⚠️ New red flags", value: clip(flags.map((f) => `• ${f}`).join("\n"), 1024) });
      }

      const watchers = await prisma.watch.findMany({
        where: { projectSlug: project.slug },
        include: { member: true },
        take: 100,
      });
      for (const watcher of watchers) {
        if (await sendDm(client, watcher.member.discordId, { embeds: [embed] })) notified += 1;
      }

      const guilds = await prisma.guildSettings.findMany({ where: { paused: false } });
      for (const guild of guilds) {
        const channelId = channelMap(guild).ecosystem;
        if (channelId) await sendToChannel(client, channelId, { embeds: [embed] });
      }
    } catch (err) {
      reportError(err, { watchRefresh: group.projectSlug });
    }
  }
  return notified;
}
