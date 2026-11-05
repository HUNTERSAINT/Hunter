import { describe, expect, it } from "vitest";
import { rankOpportunities, scoreOpportunity, type MatchProfile, type MatchTarget } from "./match.js";

const profile: MatchProfile = {
  skills: ["solidity", "react"],
  experienceLevel: "junior",
  preferredRoles: ["developer"],
  ecosystems: ["ethereum"],
  workArrangement: "remote",
};

const target = (over: Partial<MatchTarget> = {}): MatchTarget => ({
  title: "Solidity Developer",
  projectName: "Example",
  description: "Build smart contracts on Ethereum",
  category: "Engineering",
  eligibility: null,
  remote: true,
  entryLevel: false,
  ...over,
});

describe("scoreOpportunity", () => {
  it("rewards matching skills, role, ecosystem and remote work", () => {
    const { score, reasons } = scoreOpportunity(profile, target());
    expect(score).toBeGreaterThan(8);
    expect(reasons.join(" ")).toMatch(/solidity/i);
  });

  it("scores unrelated listings at zero", () => {
    const { score } = scoreOpportunity(profile, target({ title: "Sales Lead", description: "Sell things", remote: false }));
    expect(score).toBe(0);
  });

  it("favours entry-level listings for junior members", () => {
    const a = scoreOpportunity(profile, target({ entryLevel: true })).score;
    const b = scoreOpportunity(profile, target({ entryLevel: false })).score;
    expect(a).toBeGreaterThan(b);
  });
});

describe("rankOpportunities", () => {
  it("sorts best first and drops non-matches", () => {
    const list = [
      target({ title: "Sales Lead", description: "Sell", remote: false }),
      target({ title: "React Developer", description: "Frontend work" }),
      target(),
    ];
    const ranked = rankOpportunities(profile, list);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].result.score).toBeGreaterThanOrEqual(ranked[1].result.score);
  });
});
