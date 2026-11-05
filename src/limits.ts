import { config } from "./config.js";
import { redis } from "./redis.js";
import { getGuildSettings } from "./services/guild.js";

export type LimitResult = { ok: true } | { ok: false; reason: string };

const today = () => new Date().toISOString().slice(0, 10);
const dailyKey = (userId: string) => `rl:daily:${userId}:${today()}`;
const cooldownKey = (userId: string) => `rl:cooldown:${userId}`;

/**
 * Enforces the per-user cooldown and daily quota for web research. `units` is how many
 * research runs the request may trigger (a comparison can trigger two). Admins can override
 * the cooldown and daily limit per server with /admin config.
 */
export async function consumeQuota(
  userId: string,
  units: number,
  guildId?: string | null,
): Promise<LimitResult> {
  let limit = config.RESEARCH_DAILY_LIMIT_PER_USER;
  let cooldown = config.RESEARCH_COOLDOWN_SECONDS;
  if (guildId) {
    const settings = await getGuildSettings(guildId);
    limit = settings.dailyLimit ?? limit;
    cooldown = settings.cooldownSeconds ?? cooldown;
  }

  const used = Number((await redis.get(dailyKey(userId))) ?? 0);
  if (used + units > limit) {
    return {
      ok: false,
      reason: `You've reached today's research limit (${limit} per day). It resets at midnight UTC.`,
    };
  }

  if (cooldown > 0) {
    const acquired = await redis.set(cooldownKey(userId), "1", "EX", cooldown, "NX");
    if (acquired === null) {
      const ttl = await redis.ttl(cooldownKey(userId));
      return {
        ok: false,
        reason: `Please wait ${Math.max(ttl, 1)}s before starting another research request.`,
      };
    }
  }

  const total = await redis.incrby(dailyKey(userId), units);
  if (total === units) await redis.expire(dailyKey(userId), 60 * 60 * 26);
  return { ok: true };
}

/** Gives the quota back when a request could not be queued or failed for good. */
export async function refundQuota(userId: string, units: number): Promise<void> {
  await redis.decrby(dailyKey(userId), units);
  await redis.del(cooldownKey(userId));
}

/**
 * Lighter limit for AI writing features (/apply, /content). They are single calls with no
 * web search, so they get a bigger daily allowance and a short cooldown.
 */
export async function consumeAssist(userId: string): Promise<LimitResult> {
  const dayKey = `rl:assist:${userId}:${today()}`;
  const coolKey = `rl:assist-cooldown:${userId}`;

  const used = Number((await redis.get(dayKey)) ?? 0);
  if (used >= config.ASSIST_DAILY_LIMIT) {
    return {
      ok: false,
      reason: `You've reached today's AI writing limit (${config.ASSIST_DAILY_LIMIT} per day). It resets at midnight UTC.`,
    };
  }
  const acquired = await redis.set(coolKey, "1", "EX", 10, "NX");
  if (acquired === null) {
    return { ok: false, reason: "Please wait a few seconds before the next request." };
  }
  const total = await redis.incr(dayKey);
  if (total === 1) await redis.expire(dayKey, 60 * 60 * 26);
  return { ok: true };
}
