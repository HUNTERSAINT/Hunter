import {
  ChannelType,
  PermissionFlagsBits as P,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type TextChannel,
} from "discord.js";
import { memberPanel } from "../buttons/panels.js";
import { channelMap, getGuildSettings, updateGuildSettings, type ChannelKey } from "./guild.js";

/** Channel and category names follow the format "🎙️ » pb-voice-room". */
export const SEP = " » ";

type Access =
  /** Members read; only the bot posts. For announcement feeds. */
  | "feed"
  /** Members read and chat. */
  | "chat"
  /** Members read, chat and use bot commands. */
  | "commands"
  /** Visible to administrators only. */
  | "admin"
  /** Members can join and talk. */
  | "voice";

type ChannelSpec = { emoji: string; name: string; access: Access; feed?: ChannelKey; topic?: string; menu?: boolean };
type CategorySpec = { emoji: string; name: string; channels: ChannelSpec[] };

export const LAYOUT: CategorySpec[] = [
  {
    emoji: "🤖",
    name: "HUNTER HQ",
    channels: [
      { emoji: "🧭", name: "start-here", access: "feed", menu: true, topic: "Tap a button to use the bot. Only you see the answers." },
      { emoji: "💬", name: "bot-commands", access: "commands", topic: "Use /menu or any slash command here." },
      { emoji: "🛠️", name: "admin-controls", access: "admin", topic: "Administrators only. Use /admin controls." },
    ],
  },
  {
    emoji: "💼",
    name: "OPPORTUNITIES",
    channels: [
      { emoji: "💼", name: "job-alerts", access: "feed", feed: "jobs", topic: "New Web3 jobs, posted by the bot." },
      { emoji: "🏆", name: "ambassador-programs", access: "feed", feed: "ambassadors", topic: "Ambassador and contributor programs." },
      { emoji: "🎯", name: "bounties-and-gigs", access: "feed", feed: "bounties", topic: "Bounties, gigs and grants." },
    ],
  },
  {
    emoji: "🔬",
    name: "RESEARCH",
    channels: [
      { emoji: "🔬", name: "project-research", access: "feed", feed: "research", topic: "Research reports from /research." },
      { emoji: "📊", name: "project-analysis", access: "feed", feed: "analysis", topic: "Project comparisons and deeper analysis." },
      { emoji: "🌐", name: "ecosystem-updates", access: "feed", feed: "ecosystem", topic: "Ecosystem news and changes to watched projects." },
      { emoji: "🗞️", name: "digests", access: "feed", feed: "digests", topic: "Daily, weekly and monthly summaries." },
    ],
  },
  {
    emoji: "🤝",
    name: "COMMUNITY",
    channels: [
      { emoji: "🤝", name: "networking", access: "chat", feed: "networking", topic: "Introduce yourself and meet other members." },
      { emoji: "🎙️", name: "job-talk-voice-room", access: "voice" },
      { emoji: "🎙️", name: "chill-voice-room", access: "voice" },
    ],
  },
];

const label = (emoji: string, name: string) => `${emoji}${SEP}${name}`;

/** Discord turns spaces into hyphens and lowercases text channel names, so compare in that form. */
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function overwrites(guild: Guild, botId: string, access: Access): OverwriteResolvable[] {
  const everyone = guild.roles.everyone.id;
  const bot: OverwriteResolvable = {
    id: botId,
    allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.AttachFiles],
  };
  switch (access) {
    case "feed":
      return [
        {
          id: everyone,
          allow: [P.ViewChannel, P.ReadMessageHistory],
          deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions],
        },
        bot,
      ];
    case "chat":
      return [
        { id: everyone, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AddReactions] },
        bot,
      ];
    case "commands":
      return [
        {
          id: everyone,
          allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.UseApplicationCommands, P.EmbedLinks],
        },
        bot,
      ];
    case "admin":
      return [{ id: everyone, deny: [P.ViewChannel] }, bot];
    case "voice":
      return [{ id: everyone, allow: [P.ViewChannel, P.Connect, P.Speak, P.UseVAD] }];
  }
}

export type SetupResult = {
  created: string[];
  reused: string[];
  mapped: string[];
  failed: string[];
  missingPermissions: string[];
};

/** Permissions the bot needs on the server to build everything. */
export function missingBotPermissions(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) return ["View Channels"];
  const need: [bigint, string][] = [
    [P.ViewChannel, "View Channels"],
    [P.ManageChannels, "Manage Channels"],
    [P.SendMessages, "Send Messages"],
    [P.EmbedLinks, "Embed Links"],
    [P.ReadMessageHistory, "Read Message History"],
  ];
  return need.filter(([flag]) => !me.permissions.has(flag)).map(([, name]) => name);
}

/**
 * Creates the categories and channels the bot needs, with permissions, and points each feed at its channel.
 * Safe to run again: anything that already exists is reused and its permissions are refreshed.
 */
export async function setupServer(guild: Guild, botId: string, opts: { voice: boolean }): Promise<SetupResult> {
  const result: SetupResult = { created: [], reused: [], mapped: [], failed: [], missingPermissions: [] };

  result.missingPermissions = missingBotPermissions(guild);
  if (result.missingPermissions.length) return result;

  const all = await guild.channels.fetch();
  const existing = [...all.values()].filter((c): c is GuildBasedChannel => c !== null);
  const settings = await getGuildSettings(guild.id);
  const feeds: Record<string, string> = { ...(channelMap(settings) as Record<string, string>) };
  const known = new Set(Object.values(feeds));

  for (const cat of LAYOUT) {
    const catName = label(cat.emoji, cat.name);
    let category = existing.find(
      (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && normalize(c.name) === normalize(catName),
    );
    try {
      if (!category) {
        category = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory, reason: "Web3 Job Hunters AI setup" });
        existing.push(category);
        result.created.push(`📁 ${catName}`);
      } else {
        result.reused.push(`📁 ${catName}`);
      }
    } catch (err) {
      result.failed.push(`📁 ${catName}: ${(err as Error).message}`);
      continue;
    }

    for (const spec of cat.channels) {
      if (spec.access === "voice" && !opts.voice) continue;
      const name = label(spec.emoji, spec.name);
      const type = spec.access === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
      const permissionOverwrites = overwrites(guild, botId, spec.access);

      // Prefer the channel already mapped to this feed, then one with the same name.
      let channel = existing.find((c) => {
        if (c.type !== type) return false;
        if (spec.feed && feeds[spec.feed] === c.id) return true;
        return normalize(c.name) === normalize(name);
      });

      try {
        let isNew = false;
        if (!channel) {
          channel = await guild.channels.create({
            name,
            type,
            parent: category.id,
            topic: spec.topic,
            permissionOverwrites,
            reason: "Web3 Job Hunters AI setup",
          } as Parameters<Guild["channels"]["create"]>[0]);
          existing.push(channel);
          isNew = true;
          result.created.push(`${type === ChannelType.GuildVoice ? "🔊" : "#"} ${name}`);
        } else {
          // Refresh permissions on channels we manage; leave the rest of their settings alone.
          if (!known.has(channel.id) || spec.feed) {
            await (channel as TextChannel).permissionOverwrites.set(permissionOverwrites, "Web3 Job Hunters AI setup");
          }
          result.reused.push(`${type === ChannelType.GuildVoice ? "🔊" : "#"} ${channel.name}`);
        }

        if (spec.feed) {
          feeds[spec.feed] = channel.id;
          result.mapped.push(`${spec.feed} → <#${channel.id}>`);
          // The analysis feed also covers comparisons; nothing else to map.
        }

        if (spec.menu && channel.isTextBased() && isNew) {
          await (channel as TextChannel).send(memberPanel());
        }
      } catch (err) {
        result.failed.push(`${name}: ${(err as Error).message}`);
      }
    }
  }

  await updateGuildSettings(guild.id, { channels: feeds });
  return result;
}
