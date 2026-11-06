import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits as P,
  type CategoryChannel,
  type Guild,
  type NonThreadGuildBasedChannel,
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
    emoji: "✍️",
    name: "CREATOR STUDIO",
    channels: [
      { emoji: "✍️", name: "content-studio", access: "admin", feed: "studio", topic: "Private. Each reply pack, KOL package and content batch gets its own thread here." },
      { emoji: "📒", name: "kol-tracker", access: "admin", feed: "tracker", topic: "Private. One tracker card per project from /kol." },
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

type Intro = { about: string; commands: string[] };

/** The welcome message posted in each channel when it is first created. */
const INTROS: Record<string, Intro> = {
  "start-here": {
    about: "Your starting point. Tap the buttons below to use the bot. Only you see the answers.",
    commands: ["`/menu` Open the button menu any time", "`/help` See everything the bot can do"],
  },
  "bot-commands": {
    about: "Use the bot here, so other channels stay clean. Everything you run is private to you.",
    commands: [
      "`/research` Full AI research on a project",
      "`/compare` Compare two projects",
      "`/jobs` `/ambassadors` `/bounties` Find open opportunities",
      "`/match` Listings that fit your profile",
      "`/profile` Set your skills and CV",
      "`/apply` Cover letters, DMs, interview prep",
      "`/track` Track applications and deadlines",
      "`/scamcheck` Check an offer or link",
      "`/menu` Everything as buttons",
    ],
  },
  "admin-controls": {
    about: "Private to administrators. Manage the bot from here.",
    commands: [
      "`/admin controls` Admin buttons",
      "`/admin analytics` Usage and estimated AI cost",
      "`/admin opportunities pending` Review listings waiting for approval",
      "`/admin config` Channels, cooldowns and limits",
      "`/admin pause` and `/admin resume`",
      "`/admin setup` Create or repair channels",
    ],
  },
  "content-studio": {
    about:
      "Private to administrators. Every result from the creator tools gets its own thread here, so packages never get mixed together.",
    commands: [
      "`/studio` Creator buttons",
      "`/reply` Reply options for a tweet",
      "`/kol` Full KOL package for a project (thread here, card in kol-tracker)",
      "`/batch` A scheduled trading and Web3 content pack",
    ],
  },
  "kol-tracker": {
    about:
      "Private to administrators. Each `/kol` run adds one card here with everything for your KOL tracker. The fields marked ✍️ are blank for you to fill in after posting.",
    commands: ["`/kol` Research a project and add its card", "Tip: use the search bar to find a project by name"],
  },
  "job-alerts": {
    about: "New Web3 jobs, posted by the bot after checks. Members can't post here.",
    commands: ["`/jobs` Search jobs yourself", "`/watch` Get a DM when a project posts something new", "`/saved` Keep listings for later"],
  },
  "ambassador-programs": {
    about: "Ambassador and contributor programs, posted by the bot.",
    commands: ["`/ambassadors` Search programs yourself", "`/apply` Draft your application answers", "`/track` Track where you applied"],
  },
  "bounties-and-gigs": {
    about: "Bounties, paid gigs and grants, posted by the bot.",
    commands: ["`/bounties` Search bounties yourself", "`/share` Share one you found and earn points", "`/scamcheck` Check anything that looks off"],
  },
  "project-research": {
    about: "Research reports from `/research` appear here. Verified facts and project claims are kept separate.",
    commands: ["`/research` Research a project", "`/projects` Search saved research", "`/watch` Follow a project"],
  },
  "project-analysis": {
    about: "Project comparisons and deeper analysis.",
    commands: ["`/compare` Compare two projects for different kinds of contributors", "`/content` Content ideas for a project"],
  },
  "ecosystem-updates": {
    about: "Changes to projects people are watching, and ecosystem news.",
    commands: ["`/watch` Follow a project", "`/unwatch` Stop following", "`/trending` What the community is watching"],
  },
  digests: {
    about: "Daily, weekly and monthly summaries of new opportunities and activity.",
    commands: ["`/digest` Get a summary on demand", "`/trending` What's popular now"],
  },
  networking: {
    about: "Introduce yourself and meet other members. You earn points for your first introduction.",
    commands: ["`/introduce` Post your introduction", "`/members` Find members by skill", "`/leaderboard` See top contributors"],
  },
};

function introEmbed(spec: ChannelSpec): EmbedBuilder | null {
  const intro = INTROS[spec.name];
  if (!intro) return null;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${spec.emoji} ${spec.name}`)
    .setDescription(intro.about)
    .addFields({ name: "Commands", value: intro.commands.join("\n") });
}

const label = (emoji: string, name: string) => `${emoji}${SEP}${name}`;

/** Discord turns spaces into hyphens and lowercases text channel names, so compare in that form. */
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function overwrites(guild: Guild, botId: string, access: Access): OverwriteResolvable[] {
  const everyone = guild.roles.everyone.id;
  const bot: OverwriteResolvable = {
    id: botId,
    allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.AttachFiles, P.CreatePublicThreads, P.SendMessagesInThreads],
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
  const existing = [...all.values()].filter((c) => c !== null) as NonThreadGuildBasedChannel[];
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

        if (isNew && channel.isTextBased() && spec.access !== "voice") {
          const embed = introEmbed(spec);
          if (embed) {
            const intro = await (channel as TextChannel).send({ embeds: [embed] });
            await intro.pin().catch(() => undefined);
          }
          if (spec.menu) await (channel as TextChannel).send(memberPanel());
        }
      } catch (err) {
        result.failed.push(`${name}: ${(err as Error).message}`);
      }
    }
  }

  await updateGuildSettings(guild.id, { channels: feeds });
  return result;
}
