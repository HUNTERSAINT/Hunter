import { createHash } from "node:crypto";
import type {
  Opportunity,
  OpportunityType,
  Prisma,
  RewardType,
} from "@prisma/client";
import type { OpportunityInput } from "../ai/opportunitySchema.js";
import { prisma } from "../db.js";
import { analyzeOpportunity } from "../security/scam.js";
import { slugify } from "../utils.js";

/** Strips tracking noise so the same listing found twice gets the same key. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "ref" || key === "source") url.searchParams.delete(key);
    }
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}${url.search}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Stable identity for duplicate detection: same project, same kind, same application page (or title). */
export function dedupeKey(o: {
  type: string;
  projectName: string;
  title: string;
  applyUrl?: string | null;
}): string {
  const base = normalizeUrl(o.applyUrl) ?? slugify(o.title);
  return createHash("sha1")
    .update(`${o.type}|${slugify(o.projectName)}|${base}`)
    .digest("hex");
}

function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T23:59:59Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type IngestResult = {
  /** Newly stored listings and listings that reopened. */
  created: Opportunity[];
  updated: number;
  skipped: number;
  pending: number;
};

/**
 * Stores listings, skipping duplicates. Listings from an official source with no warning signs are
 * approved automatically. Everything else waits for an admin, along with any scam notes.
 */
export async function ingestOpportunities(
  items: OpportunityInput[],
  opts: { submittedById?: string; forcePending?: boolean } = {},
): Promise<IngestResult> {
  const result: IngestResult = { created: [], updated: 0, skipped: 0, pending: 0 };
  const now = new Date();

  for (const item of items) {
    const deadline = parseDeadline(item.deadline);
    if (!item.isOpen || (deadline && deadline < now)) {
      result.skipped += 1;
      continue;
    }

    const assessment = analyzeOpportunity(item);
    const key = dedupeKey(item);
    const data = {
      type: item.type,
      title: item.title,
      projectName: item.projectName,
      projectSlug: slugify(item.projectName),
      description: item.description,
      category: item.category ?? null,
      location: item.location ?? null,
      remote: item.remote ?? null,
      compensation: item.compensation ?? null,
      rewardType: item.rewardType,
      experience: item.experience ?? null,
      entryLevel: item.entryLevel,
      noDegree: item.noDegree,
      eligibility: item.eligibility ?? null,
      responsibilities: item.responsibilities ?? null,
      applicationProcess: item.applicationProcess ?? null,
      deadline,
      applyUrl: item.applyUrl ?? null,
      sourceUrl: item.sourceUrl ?? null,
      verified: item.officialSource && assessment.risk === "none",
      scamRisk: assessment.risk,
      scamNotes:
        assessment.findings.length > 0
          ? assessment.findings.map((f) => `${f.label} ("${f.evidence}")`).join("; ").slice(0, 500)
          : null,
      lastVerifiedAt: now,
    };

    const existing = await prisma.opportunity.findUnique({ where: { dedupeKey: key } });

    if (existing) {
      const reopened = !existing.isOpen && existing.status === "APPROVED";
      const updated = await prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          ...data,
          isOpen: true,
          ...(reopened ? { notifiedAt: null, closingNotifiedAt: null } : {}),
        },
      });
      result.updated += 1;
      if (reopened) result.created.push(updated);
      continue;
    }

    const trusted =
      !opts.forcePending && item.officialSource && Boolean(item.applyUrl) && assessment.risk === "none";
    const created = await prisma.opportunity.create({
      data: {
        ...data,
        dedupeKey: key,
        status: trusted ? "APPROVED" : "PENDING",
        submittedById: opts.submittedById ?? null,
      },
    });
    result.created.push(created);
    if (!trusted) result.pending += 1;
  }

  return result;
}

export type OppFilters = {
  types?: OpportunityType[];
  q?: string;
  categoryKeywords?: string[];
  remote?: boolean;
  entry?: boolean;
  rewardType?: RewardType;
  since?: Date;
  limit?: number;
};

/** Open, approved listings, with verified ones first. */
export async function searchOpportunities(filters: OppFilters): Promise<Opportunity[]> {
  const and: Prisma.OpportunityWhereInput[] = [
    { OR: [{ deadline: null }, { deadline: { gte: new Date() } }] },
  ];

  if (filters.q) {
    const contains = { contains: filters.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { title: contains },
        { projectName: contains },
        { description: contains },
        { category: contains },
      ],
    });
  }
  if (filters.categoryKeywords && filters.categoryKeywords.length > 0) {
    and.push({
      OR: filters.categoryKeywords.flatMap((keyword) => [
        { title: { contains: keyword, mode: "insensitive" as const } },
        { category: { contains: keyword, mode: "insensitive" as const } },
      ]),
    });
  }
  if (filters.remote) and.push({ remote: true });
  if (filters.entry) and.push({ OR: [{ entryLevel: true }, { noDegree: true }] });

  return prisma.opportunity.findMany({
    where: {
      status: "APPROVED",
      isOpen: true,
      ...(filters.types && filters.types.length > 0 ? { type: { in: filters.types } } : {}),
      ...(filters.rewardType ? { rewardType: filters.rewardType } : {}),
      ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
      AND: and,
    },
    orderBy: [{ verified: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 8,
  });
}
