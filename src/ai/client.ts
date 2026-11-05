import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

export const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

/** Records token and web search usage so /admin analytics can show an estimated cost. */
export async function trackUsage(kind: string, response: OpenAI.Responses.Response): Promise<void> {
  try {
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const webSearches = response.output.filter((item) => item.type === "web_search_call").length;
    const estCostUsd =
      (inputTokens / 1_000_000) * config.OPENAI_INPUT_COST_PER_M +
      (outputTokens / 1_000_000) * config.OPENAI_OUTPUT_COST_PER_M +
      webSearches * config.OPENAI_WEB_SEARCH_COST;
    await prisma.usageLog.create({
      data: { kind, model: config.OPENAI_MODEL, inputTokens, outputTokens, webSearches, estCostUsd },
    });
  } catch (err) {
    logger.warn({ err }, "failed to record AI usage");
  }
}

/** One text-only generation call (no web search), used by the writing features. */
export async function generateText(opts: {
  kind: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const response = await openai.responses.create({
    model: config.OPENAI_MODEL,
    instructions: opts.instructions,
    input: opts.input,
    max_output_tokens: opts.maxOutputTokens ?? 1500,
  });
  await trackUsage(opts.kind, response);
  const text = response.output_text.trim();
  if (!text) throw new Error("The AI returned an empty response.");
  return text;
}
