import { z } from "zod";

const confidence = z.enum(["low", "medium", "high"]);

/**
 * Every research area separates three kinds of information, as the spec requires:
 *  - verified: confirmed by a primary or independent source
 *  - claimed:  stated by the project itself and not independently confirmed
 *  - unknown:  looked for but not found
 */
const section = z.object({
  summary: z.string().default("No information found."),
  verified: z.array(z.string()).default([]),
  claimed: z.array(z.string()).default([]),
  unknown: z.array(z.string()).default([]),
});

export const SECTION_LABELS = {
  overview: "Project overview",
  team: "Founders and team",
  funding: "Funding",
  partnerships: "Partnerships",
  technology: "Technology",
  tokenomics: "Tokenomics",
  ecosystem: "Ecosystem",
  community: "Community",
  roadmap: "Roadmap",
  competitors: "Competitors",
  security: "Security",
  reputation: "Reputation",
} as const;

export type SectionKey = keyof typeof SECTION_LABELS;
export const SECTION_KEYS = Object.keys(SECTION_LABELS) as SectionKey[];

export const reportSchema = z.object({
  projectName: z.string(),
  website: z.string().nullish(),
  oneLiner: z.string().default(""),
  sections: z.object({
    overview: section.default({}),
    team: section.default({}),
    funding: section.default({}),
    partnerships: section.default({}),
    technology: section.default({}),
    tokenomics: section.default({}),
    ecosystem: section.default({}),
    community: section.default({}),
    roadmap: section.default({}),
    competitors: section.default({}),
    security: section.default({}),
    reputation: section.default({}),
  }),
  redFlags: z
    .array(
      z.object({
        flag: z.string(),
        evidence: z.string(),
        confidence,
      }),
    )
    .default([]),
  opportunityNotes: z.array(z.string()).default([]),
  overallConfidence: confidence.default("low"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});

export type ResearchReport = z.infer<typeof reportSchema>;

export const comparisonSchema = z.object({
  summary: z.string(),
  dimensions: z
    .array(z.object({ name: z.string(), projectA: z.string(), projectB: z.string() }))
    .default([]),
  bestFor: z
    .array(
      z.object({
        contributorType: z.string(),
        recommendation: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  risks: z
    .object({
      projectA: z.array(z.string()).default([]),
      projectB: z.array(z.string()).default([]),
    })
    .default({}),
  caveats: z.array(z.string()).default([]),
});

export type Comparison = z.infer<typeof comparisonSchema>;
