import { config } from "../config.js";
import { logger } from "../logger.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const headers = { "content-type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY };

async function probe(model: string, search: boolean): Promise<string> {
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the word ok." }] }],
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { maxOutputTokens: 20 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return "OK";
    const body = (await res.text()).slice(0, 300);
    return `${res.status} ${body}`;
  } catch (err) {
    return `failed: ${(err as Error).message}`;
  }
}

/** Logs which Gemini models and features this key can actually use. Runs once at startup. */
export async function diagnoseGemini(): Promise<void> {
  try {
    const list = await fetch(`${BASE}/models?pageSize=100`, { headers, signal: AbortSignal.timeout(30_000) });
    const data = (await list.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""))
      .filter((n) => n.startsWith("gemini"));
    logger.info({ models: names.join(", ") }, "GEMINI-DIAG available models");

    const candidates = [...new Set([config.GEMINI_MODEL, ...names.filter((n) => /flash/.test(n)).slice(0, 8)])];
    for (const model of candidates) {
      const plain = await probe(model, false);
      const search = await probe(model, true);
      logger.info({ model, plain, search }, "GEMINI-DIAG probe");
    }
  } catch (err) {
    logger.warn({ err }, "GEMINI-DIAG failed");
  }
}
