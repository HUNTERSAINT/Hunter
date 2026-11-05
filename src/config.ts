import "dotenv/config";
import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
const optionalString = z.string().optional().or(z.literal(""));

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: optionalString,
  RESEARCH_CHANNEL_ID: optionalString,

  OPENAI_API_KEY: z.string().min(1),
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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
