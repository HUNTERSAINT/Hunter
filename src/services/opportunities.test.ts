import { describe, expect, it } from "vitest";
import { dedupeKey, normalizeUrl } from "./opportunities.js";

describe("normalizeUrl", () => {
  it("ignores tracking parameters, www, trailing slashes and case", () => {
    expect(normalizeUrl("https://www.Example.com/jobs/1/?utm_source=x&ref=y")).toBe("example.com/jobs/1");
  });
  it("keeps meaningful query parameters", () => {
    expect(normalizeUrl("https://example.com/jobs?id=7")).toBe("example.com/jobs?id=7");
  });
  it("returns null for bad input", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});

describe("dedupeKey", () => {
  const base = { type: "JOB", projectName: "Example Protocol", title: "Solidity Developer" };

  it("is the same for the same application page with different tracking", () => {
    const a = dedupeKey({ ...base, applyUrl: "https://example.com/jobs/1?utm_source=x" });
    const b = dedupeKey({ ...base, applyUrl: "https://www.example.com/jobs/1/" });
    expect(a).toBe(b);
  });

  it("differs by project, type or page", () => {
    const a = dedupeKey({ ...base, applyUrl: "https://example.com/jobs/1" });
    expect(dedupeKey({ ...base, projectName: "Other", applyUrl: "https://example.com/jobs/1" })).not.toBe(a);
    expect(dedupeKey({ ...base, type: "BOUNTY", applyUrl: "https://example.com/jobs/1" })).not.toBe(a);
    expect(dedupeKey({ ...base, applyUrl: "https://example.com/jobs/2" })).not.toBe(a);
  });

  it("falls back to the title when there is no link", () => {
    expect(dedupeKey({ ...base })).toBe(dedupeKey({ ...base, applyUrl: null }));
  });
});
