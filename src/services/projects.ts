import type { Prisma, Project } from "@prisma/client";
import { runResearch } from "../ai/research.js";
import { reportSchema, type ResearchReport, type SectionKey } from "../ai/schema.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { slugify } from "../utils.js";

export type ResearchResult = {
  project: Project;
  report: ResearchReport;
  cached: boolean;
};

const SNAPSHOTS_KEPT = 10;

/**
 * Returns stored research when it is recent enough, otherwise runs fresh research and stores it
 * (keeping a history of earlier versions). Projects are cached under a slug of the query the
 * member typed, or `slugOverride` when refreshing a known project.
 */
export async function getOrResearch(
  query: string,
  force: boolean,
  slugOverride?: string,
): Promise<ResearchResult> {
  const slug = slugOverride ?? slugify(query);
  if (!slug) throw new Error("The project name or link could not be understood.");

  if (!force && config.RESEARCH_CACHE_DAYS > 0) {
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (existing) {
      const ageMs = Date.now() - existing.researchedAt.getTime();
      const fresh = ageMs < config.RESEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000;
      const parsed = reportSchema.safeParse(existing.report);
      if (fresh && parsed.success) {
        return { project: existing, report: parsed.data, cached: true };
      }
    }
  }

  const report = await runResearch(query);
  const now = new Date();
  const json = report as unknown as Prisma.InputJsonValue;
  const project = await prisma.project.upsert({
    where: { slug },
    create: {
      slug,
      name: report.projectName,
      website: report.website ?? null,
      report: json,
      overallConfidence: report.overallConfidence,
      researchedAt: now,
    },
    update: {
      name: report.projectName,
      website: report.website ?? null,
      report: json,
      overallConfidence: report.overallConfidence,
      researchedAt: now,
    },
  });

  await prisma.projectSnapshot.create({ data: { projectId: project.id, report: json } });
  const old = await prisma.projectSnapshot.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    skip: SNAPSHOTS_KEPT,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.projectSnapshot.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  }

  return { project, report, cached: false };
}

/** Verified items in a section that were not in the previous version of the report. */
export function newVerifiedItems(
  previous: ResearchReport | null,
  next: ResearchReport,
  section: SectionKey,
): string[] {
  const before = new Set((previous?.sections[section].verified ?? []).map((s) => s.trim().toLowerCase()));
  return next.sections[section].verified.filter((item) => !before.has(item.trim().toLowerCase()));
}

/** Red flags that appear in the new report but not the previous one. */
export function newRedFlags(previous: ResearchReport | null, next: ResearchReport): string[] {
  const before = new Set((previous?.redFlags ?? []).map((f) => f.flag.trim().toLowerCase()));
  return next.redFlags.map((f) => f.flag).filter((flag) => !before.has(flag.trim().toLowerCase()));
}
