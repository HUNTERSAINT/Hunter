import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type MessageCreateOptions,
} from "discord.js";
import { logger } from "./logger.js";
import { chunkText } from "./utils.js";

/** Posts to a channel and reports whether it worked, without throwing. */
export async function sendToChannel(
  client: Client,
  channelId: string,
  payload: string | MessageCreateOptions,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isSendable()) return false;
    await channel.send(payload);
    return true;
  } catch (err) {
    logger.warn({ err, channelId }, "could not post to channel");
    return false;
  }
}

/** Sends a direct message. Returns false when the member has DMs closed. */
export async function sendDm(
  client: Client,
  discordId: string,
  payload: string | MessageCreateOptions,
): Promise<boolean> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(payload);
    return true;
  } catch {
    return false;
  }
}

/** Replies with text of any length by splitting it across messages (all private to the user). */
export async function replyLong(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
  const chunks = chunkText(text, 1900);
  await interaction.editReply(chunks[0] ?? "(no content)");
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
  }
}
