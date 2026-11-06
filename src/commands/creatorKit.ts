import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { replyLong, sendToChannel } from "../discordUtils.js";
import { reportError } from "../monitoring.js";
import { channelMap, getGuildSettings } from "../services/guild.js";
import { chunkText, clip } from "../utils.js";

/** Creator tools are for server administrators. Call after deferring the reply. */
export async function adminOnly(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  await interaction.editReply("The creator tools are for server administrators.");
  return false;
}

const NO_PING = { parse: [] as never[] };

/** Splits a long result into labeled sections (numbered headings, day headings, trend brief). */
function splitSections(text: string): string[] {
  return text
    .split(/\n(?=RESEARCH NOTES\n|\d\. [A-Z][A-Z0-9 \/&()\-]{3,}\n|📅 DAY |🔎 TREND BRIEF|SOURCES\n)/)
    .map((s) => s.replace(/\n?———\n?/g, "").trim())
    .filter(Boolean);
}

/** Makes the first line of a section bold, with a divider above it, so sections are easy to tell apart. */
function formatSection(section: string): string {
  const [first, ...rest] = section.split("\n");
  return `━━━━━━━━━━━━━━━━━━\n**${first}**${rest.length ? `\n${rest.join("\n")}` : ""}`;
}

/**
 * Puts a long result in its own thread in the studio channel, split into labeled sections.
 * Returns the thread (or channel) id it was posted in, or null when no studio channel is set or posting failed.
 */
async function postToStudio(
  interaction: ChatInputCommandInteraction,
  title: string,
  text: string,
): Promise<string | null> {
  if (!interaction.guildId) return null;
  const studioId = channelMap(await getGuildSettings(interaction.guildId)).studio;
  if (!studioId) return null;

  try {
    const channel = await interaction.client.channels.fetch(studioId);
    if (!channel || channel.type !== ChannelType.GuildText) return null;

    let targetId = studioId;
    try {
      const thread = await (channel as TextChannel).threads.create({
        name: clip(title, 100),
        autoArchiveDuration: 10080,
        reason: "Creator studio result",
      });
      targetId = thread.id;
    } catch {
      // No thread permission: post in the channel itself under a title line.
      await sendToChannel(interaction.client, studioId, { content: `**${title}**`, allowedMentions: NO_PING });
    }

    for (const section of splitSections(text)) {
      for (const part of chunkText(formatSection(section), 1900)) {
        const ok = await sendToChannel(interaction.client, targetId, { content: part, allowedMentions: NO_PING });
        if (!ok) return null;
      }
    }
    return targetId;
  } catch (err) {
    reportError(err, { step: "post-to-studio" });
    return null;
  }
}

/** Delivers a result: to a thread in the studio channel if set, otherwise privately to the user. */
export async function deliver(
  interaction: ChatInputCommandInteraction,
  title: string,
  text: string,
): Promise<string | null> {
  const id = await postToStudio(interaction, title, text);
  if (id) {
    await interaction.editReply(`Done. It's in <#${id}>.`);
    return id;
  }
  await replyLong(interaction, `**${title}**\n\n${text}`);
  return null;
}

const BLANK_FOR_YOU = [
  "Link to Content",
  "Engagements",
  "Payment Amount",
  "Payment Status",
  "Currency",
  "Content Score",
  "Rating",
  "Follow-up Date",
  "Contact Person",
];

const v = (fields: Record<string, string>, key: string) => fields[key]?.trim() || "—";

/** Posts one clean tracker card for a project into the tracker channel. Returns the channel id or null. */
export async function postTrackerCard(
  interaction: ChatInputCommandInteraction,
  fields: Record<string, string>,
  packageId: string | null,
): Promise<string | null> {
  if (!interaction.guildId) return null;
  const trackerId = channelMap(await getGuildSettings(interaction.guildId)).tracker;
  if (!trackerId) return null;

  const priority = (fields["Priority"] ?? "").toLowerCase();
  const color = priority.startsWith("high") ? 0xed4245 : priority.startsWith("med") ? 0xfee75c : 0x57f287;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📒 ${clip(v(fields, "Project"), 200)}`)
    .setDescription(packageId ? `📂 Full package: <#${packageId}>` : "Full package was sent to you privately.")
    .addFields(
      { name: "Status", value: v(fields, "Status"), inline: true },
      { name: "Priority", value: v(fields, "Priority"), inline: true },
      { name: "Date Applied", value: v(fields, "Date Applied"), inline: true },
      { name: "Type", value: clip(v(fields, "Type"), 1000), inline: true },
      { name: "Category", value: clip(v(fields, "Category"), 1000), inline: true },
      { name: "Platform", value: clip(v(fields, "Platform"), 1000), inline: true },
      { name: "Campaign / Referral Link", value: clip(v(fields, "Campaign / Referral Link"), 1000) },
      { name: "Deliverables", value: clip(v(fields, "Deliverables"), 1000) },
      { name: "Notes", value: clip(v(fields, "Notes"), 1000) },
      { name: "Tags", value: clip(v(fields, "Tags"), 1000), inline: true },
      { name: "Next Action", value: clip(v(fields, "Next Action"), 1000), inline: true },
      { name: "✍️ Fill in after posting", value: BLANK_FOR_YOU.map((f) => `${f}: —`).join("\n") },
    )
    .setFooter({ text: `Added ${new Date().toISOString().slice(0, 10)}` });

  const ok = await sendToChannel(interaction.client, trackerId, { embeds: [embed], allowedMentions: NO_PING });
  return ok ? trackerId : null;
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
