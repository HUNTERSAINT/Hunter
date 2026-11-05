import { describe, expect, it } from "vitest";
import { analyzeOpportunity, analyzeText, riskAtLeast } from "./scam.js";

describe("analyzeText", () => {
  it("finds nothing in an ordinary job post", () => {
    const result = analyzeText(
      "We are hiring a Solidity developer. 2+ years experience. Apply on our careers page at https://jobs.lever.co/example/123.",
    );
    expect(result.risk).toBe("none");
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toMatch(/not proof/i);
  });

  it("flags upfront fees", () => {
    const result = analyzeText("Congrats! Pay a small registration fee to secure your slot.");
    expect(result.findings.map((f) => f.rule)).toContain("upfront-fee");
    expect(riskAtLeast(result.risk, "medium")).toBe(true);
  });

  it("rates a seed phrase request as high risk", () => {
    const result = analyzeText("To verify your account please send your seed phrase to our recruiter.");
    expect(result.risk).toBe("high");
  });

  it("does not flag warnings that tell people NOT to do something", () => {
    const result = analyzeText("We will never ask for your seed phrase or a registration fee.");
    expect(result.risk).toBe("none");
  });

  it("flags unrealistic earnings", () => {
    const result = analyzeText("Earn $500 per day with guaranteed income, no experience needed.");
    expect(result.findings.map((f) => f.rule)).toContain("unrealistic-earnings");
  });

  it("flags link shorteners and lookalike domains", () => {
    const short = analyzeText("Apply here https://bit.ly/abc123");
    expect(short.findings.some((f) => f.rule.startsWith("shortened-link"))).toBe(true);

    const lookalike = analyzeText("Claim your role at https://uniswapp.org/careers");
    expect(lookalike.findings.some((f) => f.rule.startsWith("lookalike-domain"))).toBe(true);
  });

  it("does not flag the real domain or common careers platforms", () => {
    expect(analyzeText("https://uniswap.org/careers").risk).toBe("none");
    expect(analyzeText("https://uniswap.notion.site/jobs").risk).toBe("none");
  });

  it("never treats missing information as a warning sign", () => {
    expect(analyzeOpportunity({ title: "Community moderator" }).risk).toBe("none");
  });
});
