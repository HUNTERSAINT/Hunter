import { prisma } from "../db.js";

export type TrendingProject = {
  slug: string;
  name: string;
  watchers: number;
  researches: number;
  score: number;
};

/** Trending = current watchers (weighted double) plus research requests in the last `days` days. */
export async function getTrending(days: number, limit = 10): Promise<TrendingProject[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [watchGroups, requestGroups] = await Promise.all([
    prisma.watch.groupBy({ by: ["projectSlug"], _count: { _all: true } }),
    prisma.researchRequest.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const projectIds = requestGroups.map((g) => g.projectId).filter((id): id is string => id !== null);
  const projects = await prisma.project.findMany({
    where: { OR: [{ slug: { in: watchGroups.map((g) => g.projectSlug) } }, { id: { in: projectIds } }] },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));

  const table = new Map<string, TrendingProject>();
  const entry = (slug: string, name: string) => {
    let row = table.get(slug);
    if (!row) {
      row = { slug, name, watchers: 0, researches: 0, score: 0 };
      table.set(slug, row);
    }
    return row;
  };

  for (const group of watchGroups) {
    const project = projects.find((p) => p.slug === group.projectSlug);
    entry(group.projectSlug, project?.name ?? group.projectSlug).watchers = group._count._all;
  }
  for (const group of requestGroups) {
    if (!group.projectId) continue;
    const project = byId.get(group.projectId);
    if (!project) continue;
    entry(project.slug, project.name).researches += group._count._all;
  }

  return [...table.values()]
    .map((row) => ({ ...row, score: row.watchers * 2 + row.researches }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
