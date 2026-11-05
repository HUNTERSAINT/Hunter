export type MatchProfile = {
  skills: string[];
  experienceLevel?: string | null;
  preferredRoles: string[];
  ecosystems: string[];
  workArrangement?: string | null;
};

export type MatchTarget = {
  title: string;
  projectName: string;
  description: string;
  category?: string | null;
  eligibility?: string | null;
  remote?: boolean | null;
  entryLevel: boolean;
};

export type MatchResult = { score: number; reasons: string[] };

/** Scores how well a listing fits a member's profile. Deterministic, so matching costs nothing. */
export function scoreOpportunity(profile: MatchProfile, target: MatchTarget): MatchResult {
  const haystack = [target.title, target.projectName, target.description, target.category, target.eligibility]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleText = `${target.title} ${target.category ?? ""}`.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  const skillHits = profile.skills.filter((s) => s && haystack.includes(s.toLowerCase()));
  if (skillHits.length > 0) {
    score += Math.min(skillHits.length * 3, 12);
    reasons.push(`Skills: ${skillHits.slice(0, 4).join(", ")}`);
  }

  const roleHits = profile.preferredRoles.filter((r) => r && titleText.includes(r.toLowerCase()));
  if (roleHits.length > 0) {
    score += Math.min(roleHits.length * 4, 8);
    reasons.push(`Preferred role: ${roleHits.slice(0, 2).join(", ")}`);
  }

  const ecosystemHits = profile.ecosystems.filter((e) => e && haystack.includes(e.toLowerCase()));
  if (ecosystemHits.length > 0) {
    score += Math.min(ecosystemHits.length * 2, 4);
    reasons.push(`Ecosystem: ${ecosystemHits.slice(0, 2).join(", ")}`);
  }

  if (profile.workArrangement === "remote" && target.remote === true) {
    score += 2;
    reasons.push("Remote");
  }

  if (target.entryLevel) {
    if (profile.experienceLevel === "entry" || profile.experienceLevel === "junior") {
      score += 3;
      reasons.push("Open to entry-level");
    } else if (profile.experienceLevel === "senior") {
      score -= 2;
    }
  }

  return { score, reasons };
}

/** Ranks listings by fit and drops the ones that match nothing. */
export function rankOpportunities<T extends MatchTarget>(
  profile: MatchProfile,
  list: T[],
): { item: T; result: MatchResult }[] {
  return list
    .map((item) => ({ item, result: scoreOpportunity(profile, item) }))
    .filter((entry) => entry.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score);
}
