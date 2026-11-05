import { generateText } from "./client.js";
import type { ResearchReport } from "./schema.js";

export const CONTENT_FORMATS = {
  x_thread: {
    label: "X thread",
    guidance: "Write a 6 to 8 post X thread: a strong hook, the key points, a takeaway. Number each post and keep each under 270 characters.",
  },
  article: {
    label: "Educational article",
    guidance: "Write an educational article outline: working title, intro angle, 5 to 6 sections with key points, and a closing.",
  },
  medium: {
    label: "Medium article",
    guidance: "Write a Medium article plan (title, subtitle, section outline) plus a polished opening paragraph.",
  },
  linkedin: {
    label: "LinkedIn post",
    guidance: "Write a LinkedIn post under 1200 characters with a clear point of view.",
  },
  ugc_script: {
    label: "UGC video script",
    guidance: "Write a 45 to 60 second UGC video script with scene directions and on-screen text.",
  },
  explainer: {
    label: "Project explainer",
    guidance: "Write a short explainer for newcomers (under 300 words) in plain language.",
  },
  review: {
    label: "Product review outline",
    guidance: "Write a product review outline: what to test, the criteria, and a pros and cons structure.",
  },
  comparison: {
    label: "Comparison article",
    guidance: "Write a comparison article outline against one or two competitors named in the research.",
  },
  tutorial: {
    label: "Tutorial",
    guidance: "Write a step-by-step tutorial outline for a beginner task with the project.",
  },
  engagement: {
    label: "Community engagement ideas",
    guidance: "Give 8 community engagement ideas: questions, polls, challenges and mini-campaigns.",
  },
} as const;

export type ContentFormat = keyof typeof CONTENT_FORMATS;

const INSTRUCTIONS = `You help members create original content about Web3 projects, to get noticed by project teams.

Rules:
- Build original angles from the research notes provided. Do not copy marketing language.
- Treat "verified" items as facts. Phrase "claimed" items as claims ("the team says").
- No price predictions, no investment advice, no promises about returns.
- If the research is thin on something, say what is missing instead of filling the gap.
- Plain text, ready to copy. End with two suggestions for getting the content in front of the project team.`;

export async function generateContent(format: ContentFormat, report: ResearchReport): Promise<string> {
  const spec = CONTENT_FORMATS[format];
  const notes = JSON.stringify({
    projectName: report.projectName,
    oneLiner: report.oneLiner,
    sections: report.sections,
    redFlags: report.redFlags,
    opportunityNotes: report.opportunityNotes,
  }).slice(0, 7000);

  return generateText({
    kind: `content:${format}`,
    instructions: INSTRUCTIONS,
    input: `Task: ${spec.guidance}\n\nResearch notes (JSON):\n${notes}`,
    maxOutputTokens: 1500,
  });
}
