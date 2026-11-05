import { describe, expect, it } from "vitest";
import { chunkText, clip, extractJson, isHttpUrl, parseDateInput, parseList, slugify } from "./utils.js";

describe("slugify", () => {
  it("normalises names and urls", () => {
    expect(slugify("Uniswap")).toBe("uniswap");
    expect(slugify("https://www.uniswap.org/")).toBe("uniswap-org");
    expect(slugify("  Layer Zero!! ")).toBe("layer-zero");
  });
});

describe("extractJson", () => {
  it("parses fenced and bare json", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":2} done')).toEqual({ a: 2 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("nothing here")).toThrow();
  });
});

describe("clip / parseList / isHttpUrl", () => {
  it("clips long text", () => {
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
  });
  it("parses and de-duplicates lists", () => {
    expect(parseList("solidity, rust; solidity")).toEqual(["solidity", "rust"]);
    expect(parseList(null)).toEqual([]);
  });
  it("validates urls", () => {
    expect(isHttpUrl("https://github.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("chunkText", () => {
  it("keeps short text whole", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });
  it("splits long text without losing content or exceeding the limit", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with some words in it.`).join("\n\n");
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });
  it("splits a single very long word", () => {
    const chunks = chunkText("x".repeat(50), 20);
    expect(chunks.every((c) => c.length <= 20)).toBe(true);
    expect(chunks.join("")).toBe("x".repeat(50));
  });
});

describe("parseDateInput", () => {
  it("parses valid dates to the end of the day", () => {
    expect(parseDateInput("2026-12-31")?.toISOString()).toBe("2026-12-31T23:59:59.000Z");
  });
  it("rejects bad input", () => {
    expect(parseDateInput("31/12/2026")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });
});
