import type { RequestKind } from "@prisma/client";
import { prisma } from "../db.js";
import { researchQueue } from "../queue.js";
import { upsertMember } from "./members.js";

/** Records a research, comparison or discovery request and puts it on the queue. */
export async function queueRequest(args: {
  kind: RequestKind;
  query: string;
  queryB?: string;
  force?: boolean;
  channelId: string;
  discordId: string;
  username: string;
}): Promise<void> {
  const member = await upsertMember(args.discordId, args.username);
  const request = await prisma.researchRequest.create({
    data: {
      kind: args.kind,
      query: args.query,
      queryB: args.queryB ?? null,
      force: args.force ?? false,
      channelId: args.channelId,
      memberId: member.id,
    },
  });
  await researchQueue.add(args.kind.toLowerCase(), { requestId: request.id });
}
