import type { GuildSettings } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";

/** The channels an admin can map with /admin config channel. */
export const CHANNEL_KEYS = [
  "jobs",
  "bounties",
  "ambassadors",
  "research",
  "analysis",
  "ecosystem",
  "digests",
  "networking",
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: GuildSettings }>();

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId },
    update: {},
  });
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export type GuildSettingsUpdate = {
  autoResearch?: boolean;
  paused?: boolean;
  cooldownSeconds?: number | null;
  dailyLimit?: number | null;
  channels?: Record<string, string>;
  roleRewards?: Record<string, number>;
};

export async function updateGuildSettings(guildId: string, data: GuildSettingsUpdate): Promise<GuildSettings> {
  const value = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function channelMap(settings: GuildSettings): Partial<Record<ChannelKey, string>> {
  return (settings.channels ?? {}) as Partial<Record<ChannelKey, string>>;
}

export function roleRewards(settings: GuildSettings): Record<string, number> {
  return (settings.roleRewards ?? {}) as Record<string, number>;
}

/**
 * Picks where a message should go: the channel an admin configured, then the legacy
 * RESEARCH_CHANNEL_ID fallback for research output, then the channel the command was used in.
 */
export async function resolveChannelId(
  guildId: string | null,
  key: ChannelKey,
  fallback: string,
): Promise<string> {
  if (guildId) {
    const channels = channelMap(await getGuildSettings(guildId));
    const configured = channels[key] ?? (key === "analysis" ? channels.research : undefined);
    if (configured) return configured;
  }
  if ((key === "research" || key === "analysis") && config.RESEARCH_CHANNEL_ID) {
    return config.RESEARCH_CHANNEL_ID;
  }
  return fallback;
}

export async function researchEnabled(guildId: string | null): Promise<boolean> {
  if (!guildId) return true;
  return (await getGuildSettings(guildId)).autoResearch;
}
