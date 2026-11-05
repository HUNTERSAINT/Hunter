import { extractJson } from "../utils.js";
import { generate } from "./client.js";
import {
  comparisonSchema,
  reportSchema,
  type Comparison,
  type ResearchReport,
} from "./schema.js";

const RESEARCH_INSTRUCTIONS = `You are a careful Web3 research analyst helping job hunters and contributors evaluate projects.

Use web search to investigate the project the user names (it may be a name, website, X profile or docs link).

Rules:
- Separate information into three buckets for every section:
  "verified": confirmed by a primary or independent source (official docs, GitHub, audit reports, reputable news, on-chain data).
  "claimed": stated by the project itself and not independently confirmed.
  "unknown": you looked and could not find it.
- Never state something as verified unless you found a source for it. Never invent funding amounts, investors, team members, audits or partnerships.
- Missing information is NOT evidence of fraud. Only add a red flag when you have concrete evidence, explain the evidence, and give a confidence level (low, medium, high).
- If the project does not have a token, say so in tokenomics instead of guessing.
- If you cannot identify the project, say so in the overview and set overallConfidence to "low".
- opportunityNotes: short, factual notes on how a contributor could get involved (open roles, ambassador or contributor programs, bounties, grants), only if you found them. Include where to look (official page) rather than guessing links.
- Keep each string short (under 220 characters). Max 4 items per verified/claimed/unknown list.
- Reply with ONE JSON object and nothing else, in exactly this shape:

{
  "projectName": string,
  "website": string | null,
  "oneLiner": string,
  "sections": {
    "overview" | "team" | "funding" | "partnerships" | "technology" | "tokenomics" | "ecosystem" | "community" | "roadmap" | "competitors" | "security" | "reputation": {
      "summary": string,
      "verified": string[],
      "claimed": string[],
      "unknown": string[]
    }
  },
  "redFlags": [{ "flag": string, "evidence": string, "confidence": "low" | "medium" | "high" }],
  "opportunityNotes": string[],
  "overallConfidence": "low" | "medium" | "high",
  "sources": [{ "title": string, "url": string }]
}`;

const COMPARE_INSTRUCTIONS = `You compare two Web3 projects for people looking for jobs, ambassador roles, bounties and contributor work.

You are given two research reports as JSON. Use only what is in them; do not add outside facts.
- Do not declare one project universally better. Explain which project suits which type of contributor (for example developer, writer, community manager, designer) and why.
- Keep "verified" facts and "claimed" facts distinct: say when a point rests on the project's own claims.
- Where a report has "unknown" for a dimension, say the information is missing rather than guessing.
- Reply with ONE JSON object and nothing else, in exactly this shape:

{
  "summary": string,
  "dimensions": [{ "name": string, "projectA": string, "projectB": string }],
  "bestFor": [{ "contributorType": string, "recommendation": string, "reason": string }],
  "risks": { "projectA": string[], "projectB": string[] },
  "caveats": string[]
}

Cover these dimensions: Technology, Funding, Team credibility, Product maturity, Ecosystem growth, Contributor opportunities, Career opportunities. Keep each string under 250 characters.`;

export async function runResearch(query: string): Promise<ResearchReport> {
  const today = new Date().toISOString().slice(0, 10);

  const { text, citations } = await generate({
    kind: "research",
    instructions: RESEARCH_INSTRUCTIONS,
    input: `Today's date: ${today}\nResearch this Web3 project: ${query}`,
    search: true,
    searchQueries: [
      `${query} crypto project official website what is it`,
      `${query} team funding investors audit security`,
      `${query} careers ambassador program bounties grants`,
    ],
  });

  const report = reportSchema.parse(extractJson(text));

  // Prefer real citations returned by the search tool over URLs the model typed out.
  if (citations.length > 0) {
    report.sources = citations.slice(0, 12);
  }
  return report;
}

export async function runComparison(
  a: ResearchReport,
  b: ResearchReport,
): Promise<Comparison> {
  const { text } = await generate({
    kind: "comparison",
    instructions: COMPARE_INSTRUCTIONS,
    input: JSON.stringify({ projectA: a, projectB: b }),
  });
  return comparisonSchema.parse(extractJson(text));
}
