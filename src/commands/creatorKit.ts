import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { replyLong, sendToChannel } from "../discordUtils.js";
import { reportError } from "../monitoring.js";
import { channelMap, getGuildSettings } from "../services/guild.js";
import { chunkText } from "../utils.js";

/** Creator tools are for server administrators. Call after deferring the reply. */
export async function adminOnly(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  await interaction.editReply("The creator tools are for server administrators.");
  return false;
}

/** Sends a long result to the private studio channel if one is set, otherwise privately to the user. */
export async function deliver(interaction: ChatInputCommandInteraction, title: string, text: string): Promise<void> {
  if (interaction.guildId) {
    const studio = channelMap(await getGuildSettings(interaction.guildId)).studio;
    if (studio) {
      const chunks = chunkText(text, 1900);
      let ok = await sendToChannel(interaction.client, studio, { content: `**✍️ ${title}**`, allowedMentions: { parse: [] } });
      for (const chunk of chunks) {
        if (!ok) break;
        ok = await sendToChannel(interaction.client, studio, { content: chunk, allowedMentions: { parse: [] } });
      }
      if (ok) {
        await interaction.editReply(`Done. It's in <#${studio}>.`);
        return;
      }
    }
  }
  await replyLong(interaction, `**✍️ ${title}**\n\n${text}`);
}

/** Runs a generator and turns failures into a friendly message (the real error is logged). */
export async function guarded(
  interaction: ChatInputCommandInteraction,
  name: string,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    reportError(err, { command: name });
    const message = (err as Error).message?.split(" [")[0] ?? "";
    await interaction
      .editReply(`I couldn't finish that. ${message.length < 160 ? message : "Please try again in a few minutes."}`)
      .catch(() => undefined);
  }
}

export const EPHEMERAL = MessageFlags.Ephemeral;
