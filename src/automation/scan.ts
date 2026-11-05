import type { OpportunityType } from "@prisma/client";
import type { Client } from "discord.js";
import { discoverOpportunities } from "../ai/opportunities.js";
import { prisma } from "../db.js";
import { reportError } from "../monitoring.js";
import { ingestOpportunities } from "../services/opportunities.js";
import { clip } from "../utils.js";
import { announceNewOpportunities } from "./announce.js";

const TYPES: OpportunityType[] = ["JOB", "AMBASSADOR", "BOUNTY", "GRANT"];

/**
 * Searches the web for each opportunity type, then scans the sources admins added with
 * /admin sources. New approved listings are announced afterwards.
 */
export async function runScan(client: Client): Promise<{ created: number; pending: number }> {
  let created = 0;
  let pending = 0;
  let attempts = 0;
  let failures = 0;

  for (const type of TYPES) {
    attempts += 1;
    try {
      const result = await ingestOpportunities(await discoverOpportunities({ type }));
      created += result.created.length;
      pending += result.pending;
    } catch (err) {
      failures += 1;
      reportError(err, { scan: type });
    }
  }

  const sources = await prisma.source.findMany({ where: { enabled: true } });
  for (const source of sources) {
    attempts += 1;
    try {
      const items = await discoverOpportunities({ type: source.type ?? undefined, sourceUrl: source.url });
      const result = await ingestOpportunities(items);
      created += result.created.length;
      pending += result.pending;
      await prisma.source.update({
        where: { id: source.id },
        data: { lastScannedAt: new Date(), lastError: null },
      });
    } catch (err) {
      failures += 1;
      reportError(err, { source: source.url });
      await prisma.source.update({
        where: { id: source.id },
        data: { lastScannedAt: new Date(), lastError: clip(err instanceof Error ? err.message : String(err), 300) },
      });
    }
  }

  await announceNewOpportunities(client);

  if (failures === attempts) throw new Error("Every scan in this run failed.");
  return { created, pending };
}
