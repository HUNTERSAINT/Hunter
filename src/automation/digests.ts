import type { OpportunityType, Prisma } from "@prisma/client";
import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "../db.js";
import { sendToChannel } from "../discordUtils.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { channelMap } from "../services/guild.js";
import { getTrending } from "../services/trending.js";

export type DigestPeriod = "daily" | "weekly" | "monthly";

const DAY = 24 * 60 * 60 * 1000;
const COLOR = 0x5865f2;

function recent(
  types: OpportunityType[],
  since: Date,
  take = 8,
  extra: Prisma.OpportunityWhereInput = {},
) {
  return prisma.opportunity.findMany({
    where: {
      status: "APPROVED",
      isOpen: true,
      type: { in: types },
      createdAt: { gte: since },
      ...extra,
    },
    orderBy: [{ verified: "desc" }, { createdAt: "desc" }],
    take,
  });
}

async function monthlyTrends(): Promise<EmbedBuilder> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY);
  const previous = new Date(now - 60 * DAY);
  const approved = { status: "APPROVED" as const };

  const [thisMonth, lastMonth, byType, categories, projects, jobs, remoteJobs, entryJobs] = await Promise.all([
    prisma.opportunity.count({ where: { ...approved, createdAt: { gte: since } } }),
    prisma.opportunity.count({ where: { ...approved, createdAt: { gte: previous, lt: since } } }),
    prisma.opportunity.groupBy({
      by: ["type"],
      where: { ...approved, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.opportunity.groupBy({
      by: ["category"],
      where: { ...approved, type: "JOB", category: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 5,
    }),
    prisma.opportunity.groupBy({
      by: ["projectName"],
      where: { ...approved, type: "JOB", createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { projectName: "desc" } },
      take: 5,
    }),
    prisma.opportunity.count({ where: { ...approved, type: "JOB", createdAt: { gte: since } } }),
    prisma.opportunity.count({ where: { ...approved, type: "JOB", remote: true, createdAt: { gte: since } } }),
    prisma.opportunity.count({
      where: { ...approved, type: "JOB", createdAt: { gte: since }, OR: [{ entryLevel: true }, { noDegree: true }] },
    }),
  ]);

  const change =
    lastMonth === 0 ? "no earlier data to compare" : `${Math.round(((thisMonth - lastMonth) / lastMonth) * 100)}% vs the previous 30 days`;
  const percent = (n: number) => (jobs === 0 ? "n/a" : `${Math.round((n / jobs) * 100)}%`);

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("Monthly digest: ecosystem and hiring trends")
    .setDescription(`**${thisMonth}** new listings in the last 30 days (${change}).`)
    .addFields(
      {
        name: "By type",
        value: byType.length ? byType.map((g) => `${g.type.toLowerCase()}: ${g._count._all}`).join("\n") : "No listings",
        inline: true,
      },
      {
        name: "Jobs",
        value: `${jobs} new • ${percent(remoteJobs)} remote • ${percent(entryJobs)} entry-level or no degree`,
        inline: true,
      },
      {
        name: "Most common job categories",
        value: categories.length ? categories.map((g) => `${g.category}: ${g._count._all}`).join("\n") : "Not enough data",
      },
      {
        name: "Projects with the most new jobs",
        value: projects.length ? projects.map((g) => `${g.projectName}: ${g._count._all}`).join("\n") : "Not enough data",
      },
    )
    .setFooter({ text: "Based on listings this bot has found and approved" });
}

export async function buildDigest(period: DigestPeriod): Promise<EmbedBuilder[]> {
  const now = Date.now();

  if (period === "daily") {
    const since = new Date(now - DAY);
    const [jobs, ambassadors] = await Promise.all([
      recent(["JOB", "BOUNTY"], since),
      recent(["AMBASSADOR", "GRANT"], since),
    ]);
    return [
      opportunityListEmbed("Daily digest: new Web3 jobs and gigs", jobs, undefined, "No new jobs or gigs in the last 24 hours."),
      opportunityListEmbed("Daily digest: new ambassador programs", ambassadors, undefined, "No new ambassador programs in the last 24 hours."),
    ];
  }

  if (period === "weekly") {
    const since = new Date(now - 7 * DAY);
    const [contributor, bounties, trending] = await Promise.all([
      recent(["AMBASSADOR", "GRANT", "BOUNTY"], since),
      recent(["BOUNTY"], since, 8, { rewardType: "CASH" }),
      getTrending(7, 5),
    ]);
    const trendingEmbed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("Weekly digest: trending Web3 projects")
      .setDescription(
        trending.length === 0
          ? "Nothing is trending yet. Research and watch projects to put them here."
          : trending
              .map((t, i) => `**${i + 1}. ${t.name}**: ${t.watchers} watching, ${t.researches} research requests this week`)
              .join("\n"),
      );
    return [
      opportunityListEmbed("Weekly digest: best contributor opportunities", contributor, undefined, "No new contributor opportunities this week."),
      trendingEmbed,
      opportunityListEmbed("Weekly digest: top cash bounties", bounties, undefined, "No new cash bounties this week."),
    ];
  }

  return [await monthlyTrends()];
}

/** The member who earned the most community points in the last 7 days, if anyone did. */
export async function buildSpotlight(): Promise<EmbedBuilder | null> {
  const since = new Date(Date.now() - 7 * DAY);
  const top = await prisma.pointEvent.groupBy({
    by: ["memberId"],
    where: { createdAt: { gte: since }, points: { gt: 0 } },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: 1,
  });
  const winner = top[0];
  if (!winner || !winner._sum.points) return null;
  const member = await prisma.member.findUnique({ where: { id: winner.memberId } });
  if (!member) return null;
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🌟 Member spotlight")
    .setDescription(`<@${member.discordId}> earned **${winner._sum.points}** community points this week. Thank you for helping the community.`);
}

/** Posts a digest to every server's digest channel (falling back to the jobs channel). Returns messages posted. */
export async function postDigest(client: Client, period: DigestPeriod): Promise<number> {
  const embeds = await buildDigest(period);
  const spotlight = period === "weekly" ? await buildSpotlight() : null;
  const guilds = await prisma.guildSettings.findMany({ where: { paused: false } });

  let posted = 0;
  for (const guild of guilds) {
    const channels = channelMap(guild);
    const target = channels.digests ?? channels.jobs;
    if (!target) continue;
    for (const embed of embeds) {
      if (await sendToChannel(client, target, { embeds: [embed] })) posted += 1;
    }
    if (spotlight && (await sendToChannel(client, channels.networking ?? target, { embeds: [spotlight] }))) {
      posted += 1;
    }
  }
  return posted;
}
