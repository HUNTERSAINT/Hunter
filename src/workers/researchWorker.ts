import { Worker } from "bullmq";
import type { Client, EmbedBuilder } from "discord.js";
import { discoverOpportunities } from "../ai/opportunities.js";
import { runComparison } from "../ai/research.js";
import { announceNewOpportunities } from "../automation/announce.js";
import { prisma } from "../db.js";
import { buildCompareEmbeds, buildResearchEmbeds } from "../embeds.js";
import { refundQuota } from "../limits.js";
import { reportError } from "../monitoring.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { RESEARCH_QUEUE, type ResearchJobData } from "../queue.js";
import { bullConnection } from "../redis.js";
import { ingestOpportunities, searchOpportunities } from "../services/opportunities.js";
import { awardPoints } from "../services/points.js";
import { getOrResearch } from "../services/projects.js";
import { clip } from "../utils.js";

const TYPES = ["JOB", "AMBASSADOR", "BOUNTY", "GRANT"] as const;

async function getSendableChannel(client: Client, channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) {
    throw new Error(`Cannot post in channel ${channelId}. Check the bot's permissions.`);
  }
  return channel;
}

/** Each embed goes in its own message because Discord caps the combined size of embeds per message. */
async function postEmbeds(client: Client, channelId: string, content: string, embeds: EmbedBuilder[]) {
  const channel = await getSendableChannel(client, channelId);
  const [first, ...rest] = embeds;
  // Only user mentions are allowed, so text a member typed (like "@everyone") can never ping a crowd.
  await channel.send({ content, embeds: [first], allowedMentions: { parse: ["users"] } });
  for (const embed of rest) {
    await channel.send({ embeds: [embed] });
  }
}

export function startResearchWorker(client: Client) {
  const worker = new Worker<ResearchJobData>(
    RESEARCH_QUEUE,
    async (job) => {
      const request = await prisma.researchRequest.findUnique({
        where: { id: job.data.requestId },
        include: { member: true },
      });
      if (!request) return;

      await prisma.researchRequest.update({
        where: { id: request.id },
        data: { status: "RUNNING", startedAt: new Date(), error: null },
      });

      const mention = `<@${request.member.discordId}>`;

      if (request.kind === "RESEARCH") {
        const result = await getOrResearch(request.query, request.force);
        const embeds = buildResearchEmbeds(result.report, {
          cached: result.cached,
          researchedAt: result.project.researchedAt,
        });
        await postEmbeds(
          client,
          request.channelId,
          `${mention} your research on **${result.report.projectName}** is ready.`,
          embeds,
        );
        await prisma.researchRequest.update({
          where: { id: request.id },
          data: { status: "COMPLETED", completedAt: new Date(), projectId: result.project.id },
        });
        if (!result.cached) {
          await awardPoints(request.memberId, 2, `Research published: ${clip(result.report.projectName, 60)}`).catch(
            () => undefined,
          );
        }
        return;
      }

      if (request.kind === "DISCOVER") {
        const type = TYPES.find((t) => t === request.queryB);
        const items = await discoverOpportunities({ type, focus: request.query || undefined });
        const ingested = await ingestOpportunities(items);
        const shown = await searchOpportunities({
          types: type ? [type] : undefined,
          q: request.query || undefined,
          limit: 8,
        });
        await postEmbeds(
          client,
          request.channelId,
          `${mention} I searched the web and found **${ingested.created.length}** new listing${ingested.created.length === 1 ? "" : "s"}` +
            (ingested.pending > 0 ? ` (${ingested.pending} waiting for admin review).` : "."),
          [opportunityListEmbed("Open opportunities", shown, undefined, "No open listings match yet.")],
        );
        await prisma.researchRequest.update({
          where: { id: request.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await announceNewOpportunities(client).catch((err) => reportError(err, { step: "announce" }));
        return;
      }

      // COMPARE: research one after the other to stay friendly to API rate limits.
      const a = await getOrResearch(request.query, false);
      const b = await getOrResearch(request.queryB ?? "", false);
      const comparison = await runComparison(a.report, b.report);
      const embeds = buildCompareEmbeds(a.report.projectName, b.report.projectName, comparison);
      await postEmbeds(
        client,
        request.channelId,
        `${mention} your comparison of **${a.report.projectName}** and **${b.report.projectName}** is ready.`,
        embeds,
      );
      await prisma.researchRequest.update({
        where: { id: request.id },
        data: { status: "COMPLETED", completedAt: new Date(), projectId: a.project.id },
      });
    },
    { connection: bullConnection, concurrency: 2 },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    reportError(err, { jobId: job.id, attempt: job.attemptsMade });

    // Only act once all retries are used up.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    try {
      const request = await prisma.researchRequest.update({
        where: { id: job.data.requestId },
        data: { status: "FAILED", error: clip(err.message, 500), completedAt: new Date() },
        include: { member: true },
      });
      await refundQuota(request.member.discordId, request.kind === "COMPARE" ? 2 : 1);

      const channel = await getSendableChannel(client, request.channelId);
      const action =
        request.kind === "COMPARE"
          ? `comparing **${clip(`${request.query} vs ${request.queryB}`, 150)}**`
          : request.kind === "DISCOVER"
            ? "searching for opportunities"
            : `researching **${clip(request.query, 150)}**`;
      await channel.send({
        content: `<@${request.member.discordId}> I couldn't finish ${action}. Your quota was refunded. Please try again later.`,
        allowedMentions: { users: [request.member.discordId] },
      });
    } catch (notifyErr) {
      reportError(notifyErr, { step: "report job failure" });
    }
  });

  worker.on("error", (err) => reportError(err, { worker: "research" }));
  return worker;
}
