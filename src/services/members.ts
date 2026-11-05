import { prisma } from "../db.js";

export function upsertMember(discordId: string, username: string) {
  return prisma.member.upsert({
    where: { discordId },
    create: { discordId, username },
    update: { username },
  });
}
