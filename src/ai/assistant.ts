import type { Member, Opportunity } from "@prisma/client";
import { generateText } from "./client.js";
import type { ResearchReport } from "./schema.js";

export const ASSIST_KINDS = {
  cover_letter: {
    label: "Cover letter",
    guidance: "Write a concise cover letter (250 to 350 words).",
  },
  ambassador_answers: {
    label: "Ambassador application answers",
    guidance:
      "Write answers to typical ambassador application questions: why this project, relevant experience, how you would grow the community, and a first-month plan. Label each question.",
  },
  outreach: {
    label: "Project outreach message",
    guidance:
      "Write a short personalised outreach message to the project team (under 900 characters) proposing one specific, realistic way the member can contribute.",
  },
  pitch: {
    label: "Partnership pitch",
    guidance:
      "Write a one-page partnership pitch: who the member is, the opportunity for the project, a concrete proposal, and a clear ask.",
  },
  cold_dm: {
    label: "Professional cold DM",
    guidance:
      "Write a professional cold DM under 600 characters, plus one short follow-up message to send a week later.",
  },
  cv_review: {
    label: "CV and portfolio improvements",
    guidance:
      "Review the CV or portfolio text provided. Give specific improvements (structure, wording, missing proof such as links and metrics) as a prioritised list, then a rewritten summary section. Do not add facts that are not in the text.",
  },
  contributor_application: {
    label: "Contributor application",
    guidance:
      "Draft a contributor application: motivation, relevant skills with proof of work, what the member wants to contribute, and availability.",
  },
  interview_prep: {
    label: "Interview questions and answers",
    guidance:
      "List 8 likely interview questions for this role or program, each with a short answer outline using only the member's real background, then 3 smart questions the member could ask.",
  },
} as const;

export type AssistKind = keyof typeof ASSIST_KINDS;

const INSTRUCTIONS = `You help people applying for Web3 jobs, ambassador programs, bounties and grants.

Rules:
- Use only facts from the member profile and the details provided. Never invent employers, job titles, years of experience, metrics, certifications, links or achievements.
- Where something is missing, write a short [bracketed placeholder] the member can fill in.
- No hype, no guarantees, no fake urgency. Sound like a capable person, not a template.
- Plain text only, ready to copy and paste. No markdown tables.
- Never ask the member to share a seed phrase, private key or payment.`;

function profileText(member: Member | null): string {
  if (!member) return "No profile saved.";
  const lines = [
    `Skills: ${member.skills.join(", ") || "not provided"}`,
    `Experience level: ${member.experienceLevel ?? "not provided"}`,
    `Preferred roles: ${member.preferredRoles.join(", ") || "not provided"}`,
    `Ecosystems: ${member.ecosystems.join(", ") || "not provided"}`,
    `Work arrangement: ${member.workArrangement ?? "not provided"}`,
    `Portfolio: ${member.portfolioUrl ?? "not provided"}`,
    `GitHub: ${member.githubUrl ?? "not provided"}`,
  ];
  if (member.cvText) lines.push(`CV / background:\n${member.cvText.slice(0, 3500)}`);
  return lines.join("\n");
}

function opportunityText(o: Opportunity | null): string {
  if (!o) return "";
  return [
    `Listing #${o.ref}: ${o.title} at ${o.projectName} (${o.type.toLowerCase()})`,
    o.description && `Description: ${o.description}`,
    o.eligibility && `Eligibility: ${o.eligibility}`,
    o.responsibilities && `Responsibilities: ${o.responsibilities}`,
    o.experience && `Experience asked: ${o.experience}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function researchText(report: ResearchReport | null): string {
  if (!report) return "";
  const { overview, technology, ecosystem } = report.sections;
  return `Research notes on ${report.projectName}: ${report.oneLiner} Overview: ${overview.summary} Technology: ${technology.summary} Ecosystem: ${ecosystem.summary}`.slice(0, 1800);
}

export async function generateAssistance(args: {
  kind: AssistKind;
  member: Member | null;
  target: string;
  opportunity: Opportunity | null;
  details: string;
  research: ResearchReport | null;
}): Promise<string> {
  const spec = ASSIST_KINDS[args.kind];
  const input = [
    `Task: ${spec.guidance}`,
    `Target: ${args.target}`,
    opportunityText(args.opportunity),
    researchText(args.research),
    args.details && `Extra details from the member:\n${args.details}`,
    `Member profile:\n${profileText(args.member)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateText({ kind: `assist:${args.kind}`, instructions: INSTRUCTIONS, input, maxOutputTokens: 1600 });
}
