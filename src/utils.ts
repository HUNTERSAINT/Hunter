/** Turns a project name or URL into a stable cache key, e.g. "https://www.uniswap.org" -> "uniswap-org". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Pulls the first JSON object out of model output, tolerating ```json fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

/** Splits "solidity, rust; react" into a clean, de-duplicated list. */
export function parseList(input: string | null, maxItems = 20, maxLen = 40): string[] {
  if (!input) return [];
  const items = input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, maxLen));
  return [...new Set(items)].slice(0, maxItems);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Splits long text into chunks that fit a Discord message, preferring paragraph and line breaks. */
export function chunkText(text: string, max = 1900): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Parses YYYY-MM-DD into the end of that day (UTC). Returns null when the date is invalid. */
export function parseDateInput(input: string | null): Date | null {
  if (!input) return null;
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Discord timestamp markup, shown in each reader's own timezone. */
export function discordDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:D>`;
}
