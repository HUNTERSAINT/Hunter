import type { OpportunityType } from "@prisma/client";
import { extractJson } from "../utils.js";
import { generate } from "./client.js";
import { parseDiscovered, type OpportunityInput } from "./opportunitySchema.js";

const TYPE_BRIEF: Record<OpportunityType, string> = {
  JOB: "genuine Web3 job openings: blockchain, Solidity, full-stack, frontend and backend developers, community and social media managers, content writers, research analysts, graphic and product designers, marketing, business development, growth, customer support and developer relations",
  AMBASSADOR:
    "ambassador and community programs: ambassador programs, community contributor programs, regional and campus ambassadors, developer advocate programs, early contributor programs, community moderator openings and testnet contributor programs",
  BOUNTY:
    "bounties and paid gigs: writing bounties, X thread competitions, UGC video campaigns, graphic design contests, bug bounties, smart contract development, translation, research tasks, community growth campaigns and hackathons",
  GRANT: "ecosystem grants and funding programs for builders and contributors",
};

const DISCOVERY_INSTRUCTIONS = `You find real, currently open Web3 opportunities using web search.

Rules:
- Only include listings you actually found on a page during this search, and that are open now. Skip anything expired.
- Prefer official sources: the project's own careers or program page, or its official page on a careers platform (Greenhouse, Lever, Ashby, Workable and similar). A reputable job board is acceptable when it links to the official application.
- Never invent a project, listing, salary or link. Copy the application link exactly as found. If there is no link, use null.
- "officialSource" is true only when the application link is on the project's own domain or its official careers platform page. Otherwise false.
- "entryLevel" and "noDegree" are true only when the listing's own requirements support that.
- rewardType describes the reward: CASH, TOKEN, POINTS, GRANT, UNPAID (exposure only) or UNKNOWN when not stated.
- Do not include anything that asks applicants to pay a fee, share a seed phrase or private key, or send crypto.
- "deadline" is an ISO date (YYYY-MM-DD) when one is stated, otherwise null.
- Return at most 10 listings. Keep descriptions under 300 characters.
- Reply with ONE JSON object and nothing else, in exactly this shape:

{
  "opportunities": [
    {
      "type": "JOB" | "AMBASSADOR" | "BOUNTY" | "GRANT",
      "title": string,
      "projectName": string,
      "description": string,
      "category": string | null,
      "location": string | null,
      "remote": boolean | null,
      "compensation": string | null,
      "rewardType": "CASH" | "TOKEN" | "POINTS" | "GRANT" | "UNPAID" | "UNKNOWN",
      "experience": string | null,
      "entryLevel": boolean,
      "noDegree": boolean,
      "eligibility": string | null,
      "responsibilities": string | null,
      "applicationProcess": string | null,
      "deadline": string | null,
      "applyUrl": string | null,
      "sourceUrl": string | null,
      "isOpen": true,
      "officialSource": boolean
    }
  ]
}

If you find nothing that qualifies, return { "opportunities": [] }.`;

/** Searches the web for open opportunities. Results are validated, but not yet stored. */
export async function discoverOpportunities(args: {
  type?: OpportunityType;
  focus?: string;
  sourceUrl?: string;
}): Promise<OpportunityInput[]> {
  const brief = args.type ? TYPE_BRIEF[args.type] : Object.values(TYPE_BRIEF).join("; ");
  const lines = [
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    `Find currently open ${brief}.`,
  ];
  if (args.focus) lines.push(`Focus on: ${args.focus}`);
  if (args.sourceUrl) {
    lines.push(`Start from this page and follow its links to individual listings: ${args.sourceUrl}`);
  }

  const { text } = await generate({
    kind: "discovery",
    instructions: DISCOVERY_INSTRUCTIONS,
    input: lines.join("\n"),
    search: true,
  });

  return parseDiscovered(extractJson(text));
}
