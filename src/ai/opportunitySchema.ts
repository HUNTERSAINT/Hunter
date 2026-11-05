import { z } from "zod";

/** A string that is trimmed to a maximum length instead of failing validation when the model runs long. */
const text = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
const optionalUrl = z.preprocess((v) => (v === "" ? null : v), z.string().url().nullish());

export const opportunityInputSchema = z.object({
  type: z.enum(["JOB", "AMBASSADOR", "BOUNTY", "GRANT"]),
  title: text(200).pipe(z.string().min(2)),
  projectName: text(120).pipe(z.string().min(1)),
  description: text(2000).default(""),
  category: text(60).nullish(),
  location: text(120).nullish(),
  remote: z.boolean().nullish(),
  compensation: text(200).nullish(),
  rewardType: z.enum(["CASH", "TOKEN", "POINTS", "GRANT", "UNPAID", "UNKNOWN"]).default("UNKNOWN"),
  experience: text(200).nullish(),
  entryLevel: z.boolean().default(false),
  noDegree: z.boolean().default(false),
  eligibility: text(500).nullish(),
  responsibilities: text(800).nullish(),
  applicationProcess: text(500).nullish(),
  /** ISO date (YYYY-MM-DD) or null when no deadline is stated. */
  deadline: z.string().nullish(),
  applyUrl: optionalUrl,
  sourceUrl: optionalUrl,
  isOpen: z.boolean().default(true),
  /** True only when the apply link is on the project's own site or its official careers platform. */
  officialSource: z.boolean().default(false),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

/** Keeps the listings that validate and silently drops the rest, so one bad item cannot sink a scan. */
export function parseDiscovered(raw: unknown): OpportunityInput[] {
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { opportunities?: unknown }).opportunities)
      ? ((raw as { opportunities: unknown[] }).opportunities)
      : [];
  const valid: OpportunityInput[] = [];
  for (const item of list) {
    const parsed = opportunityInputSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}
