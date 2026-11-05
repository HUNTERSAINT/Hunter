import "dotenv/config";
import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
const optionalString = z.string().optional().or(z.literal(""));

const schema = z
  .object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: optionalString,
  RESEARCH_CHANNEL_ID: optionalString,

  // "openai" (paid) or "gemini" (free key from aistudio.google.com).
  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  GEMINI_API_KEY: z.string().default(""),
  // Free web search (https://tavily.com) used with Gemini, because Google Search grounding is not free.
  // Optional: lets /kol add the tracker row straight into your Notion database.
  NOTION_TOKEN: z.string().default(""),
  NOTION_DATABASE_ID: z.string().default(""),
  TAVILY_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  // Tried in order when the main model is out of free quota or overloaded. Each model has its own daily allowance.
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3-flash-preview,gemini-3.1-flash-lite-preview,gemini-flash-lite-latest"),

  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4.1"),
  // Used only for the cost estimates shown in /admin analytics. Update them if your pricing differs.
  OPENAI_INPUT_COST_PER_M: z.coerce.number().default(2),
  OPENAI_OUTPUT_COST_PER_M: z.coerce.number().default(8),
  OPENAI_WEB_SEARCH_COST: z.coerce.number().default(0.025),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  RESEARCH_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(120),
  RESEARCH_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).default(10),
  RESEARCH_CACHE_DAYS: z.coerce.number().int().min(0).default(7),
  ASSIST_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),

  // Scheduled web scans cost money, so they are off until you turn them on.
  AUTO_SCAN_ENABLED: flag,
  SCAN_CRON: z.string().default("0 6,18 * * *"),

  INGEST_API_KEY: optionalString,
  SENTRY_DSN: optionalString,

  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.string().default("info"),
  })
  .superRefine((v, ctx) => {
    if (v.AI_PROVIDER === "openai" && !v.OPENAI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required when AI_PROVIDER=openai" });
    }
    if (v.AI_PROVIDER === "gemini" && !v.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "Required when AI_PROVIDER=gemini" });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
