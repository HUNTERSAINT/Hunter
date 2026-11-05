import type { Client } from "discord.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { getGuildSettings, roleRewards } from "./guild.js";

let discordClient: Client | null = null;

/** Lets the points service add reward roles. Called once at startup. */
export function setPointsClient(client: Client): void {
  discordClient = client;
}

async function syncRoles(discordId: string, total: number): Promise<void> {
  if (!discordClient) return;
  const guilds = await prisma.guildSettings.findMany({ where: { NOT: { roleRewards: { equals: {} } } } });
  for (const guildRow of guilds) {
    const rewards = roleRewards(await getGuildSettings(guildRow.guildId));
    const eligible = Object.entries(rewards).filter(([, threshold]) => total >= threshold);
    if (eligible.length === 0) continue;
    try {
      const guild = await discordClient.guilds.fetch(guildRow.guildId);
      const member = await guild.members.fetch(discordId);
      for (const [roleId] of eligible) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId, "Community points reward");
        }
      }
    } catch (err) {
      logger.warn({ err, guildId: guildRow.guildId }, "could not sync reward roles");
    }
  }
}

/** Adds (or removes) community points, logs the reason and hands out any reward roles. Returns the new total. */
export async function awardPoints(memberId: string, points: number, reason: string): Promise<number> {
  const [member] = await prisma.$transaction([
    prisma.member.update({ where: { id: memberId }, data: { points: { increment: points } } }),
    prisma.pointEvent.create({ data: { memberId, points, reason } }),
  ]);
  if (points > 0) {
    await syncRoles(member.discordId, member.points).catch(() => undefined);
  }
  return member.points;
}

/** Awards points only if this exact reason has never been awarded to the member before. */
export async function awardPointsOnce(memberId: string, points: number, reason: string): Promise<boolean> {
  const existing = await prisma.pointEvent.findFirst({ where: { memberId, reason } });
  if (existing) return false;
  await awardPoints(memberId, points, reason);
  return true;
}
