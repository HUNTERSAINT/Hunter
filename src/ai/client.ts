import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

export type Citation = { title: string; url: string };

export type AiResult = { text: string; citations: Citation[] };

type Usage = { inputTokens: number; outputTokens: number; webSearches: number };

type GenerateOptions = {
  /** Label used for usage tracking, e.g. "research". */
  kind: string;
  instructions: string;
  input: string;
  /** Let the model search the web. */
  search?: boolean;
  maxOutputTokens?: number;
};

export const activeModel = config.AI_PROVIDER === "gemini" ? config.GEMINI_MODEL : config.OPENAI_MODEL;

/** Records token and web search usage so /admin analytics can show an estimated cost. */
async function trackUsage(kind: string, usage: Usage): Promise<void> {
  try {
    // Gemini's free tier costs nothing, so its estimate is zero.
    const estCostUsd =
      config.AI_PROVIDER === "gemini"
        ? 0
        : (usage.inputTokens / 1_000_000) * config.OPENAI_INPUT_COST_PER_M +
          (usage.outputTokens / 1_000_000) * config.OPENAI_OUTPUT_COST_PER_M +
          usage.webSearches * config.OPENAI_WEB_SEARCH_COST;
    await prisma.usageLog.create({
      data: {
        kind,
        model: activeModel,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        webSearches: usage.webSearches,
        estCostUsd,
      },
    });
  } catch (err) {
    logger.warn({ err }, "failed to record AI usage");
  }
}

// ---------- OpenAI ----------

let openaiClient: OpenAI | undefined;

async function viaOpenAI(opts: GenerateOptions): Promise<{ result: AiResult; usage: Usage }> {
  openaiClient ??= new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await openaiClient.responses.create({
    model: config.OPENAI_MODEL,
    instructions: opts.instructions,
    input: opts.input,
    ...(opts.maxOutputTokens ? { max_output_tokens: opts.maxOutputTokens } : {}),
    // The tool name is "web_search_preview" on current openai SDK 4.x releases.
    // If your SDK version uses "web_search", change it here.
    ...(opts.search ? { tools: [{ type: "web_search_preview" as const }] } : {}),
  });

  const found = new Map<string, Citation>();
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && a.url) found.set(a.url, { title: a.title || a.url, url: a.url });
      }
    }
  }

  return {
    result: { text: response.output_text, citations: [...found.values()] },
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      webSearches: response.output.filter((i) => i.type === "web_search_call").length,
    },
  };
}

// ---------- Gemini (REST, no extra dependency) ----------

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function viaGemini(opts: GenerateOptions): Promise<{ result: AiResult; usage: Usage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.instructions }] },
    contents: [{ role: "user", parts: [{ text: opts.input }] }],
    ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 8192, temperature: 0.3 },
  });

  let data: GeminiResponse | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      data = (await res.json()) as GeminiResponse;
      break;
    }
    const detail = ((await res.json().catch(() => ({}))) as GeminiResponse).error?.message ?? res.statusText;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (res.status === 429) {
      logger.warn({ detail, model: config.GEMINI_MODEL, search: !!opts.search }, "Gemini quota error");
      throw new Error(`The free AI quota is used up for now. Please try again later. [Google said: ${detail.slice(0, 400)}]`);
    }
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }
  if (!data) throw new Error("Gemini returned no response.");

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Gemini returned no answer${data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ""}.`);
  }
  const text = (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("");

  const found = new Map<string, Citation>();
  for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (uri) found.set(uri, { title: chunk.web?.title || uri, url: uri });
  }

  return {
    result: { text, citations: [...found.values()] },
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      webSearches: candidate.groundingMetadata?.webSearchQueries?.length ?? 0,
    },
  };
}

/** One model call on whichever provider is configured (AI_PROVIDER). */
export async function generate(opts: GenerateOptions): Promise<AiResult> {
  const { result, usage } = config.AI_PROVIDER === "gemini" ? await viaGemini(opts) : await viaOpenAI(opts);
  await trackUsage(opts.kind, usage);
  return result;
}

/** One text-only generation call (no web search), used by the writing features. */
export async function generateText(opts: {
  kind: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const { text } = await generate({ ...opts, maxOutputTokens: opts.maxOutputTokens ?? 1500 });
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The AI returned an empty response.");
  return trimmed;
}
