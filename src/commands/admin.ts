import type { OpportunityType } from "@prisma/client";
import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { announceNewOpportunities } from "../automation/announce.js";
import { adminPanel, memberPanel } from "../buttons/panels.js";
import { postDigest, type DigestPeriod } from "../automation/digests.js";
import { automationQueue, runAutomationNow } from "../automation/scheduler.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { researchQueue } from "../queue.js";
import {
  CHANNEL_KEYS,
  channelMap,
  getGuildSettings,
  roleRewards,
  updateGuildSettings,
  type ChannelKey,
} from "../services/guild.js";
import { upsertMember } from "../services/members.js";
import { awardPoints } from "../services/points.js";
import { clip, discordDate, isHttpUrl } from "../utils.js";
import type { Command } from "./types.js";

const TYPE_CHOICES = [
  { name: "Jobs", value: "JOB" },
  { name: "Ambassador and contributor programs", value: "AMBASSADOR" },
  { name: "Bounties and gigs", value: "BOUNTY" },
  { name: "Grants", value: "GRANT" },
];

type Handler = (interaction: ChatInputCommandInteraction, guildId: string) => Promise<void>;

// ---------- config ----------

const configView: Handler = async (interaction, guildId) => {
  const settings = await getGuildSettings(guildId);
  const channels = channelMap(settings);
  const rewards = Object.entries(roleRewards(settings));
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Bot settings")
    .addFields(
      { name: "Status", value: settings.paused ? "⏸️ Paused" : "▶️ Running", inline: true },
      { name: "Research and web refresh", value: settings.autoResearch ? "On" : "Off", inline: true },
      { name: "Scheduled web scans", value: config.AUTO_SCAN_ENABLED ? `On (${config.SCAN_CRON} UTC)` : "Off (set AUTO_SCAN_ENABLED=true)", inline: true },
      {
        name: "Cooldown",
        value: `${settings.cooldownSeconds ?? config.RESEARCH_COOLDOWN_SECONDS}s${settings.cooldownSeconds === null ? " (default)" : ""}`,
        inline: true,
      },
      {
        name: "Daily research limit",
        value: `${settings.dailyLimit ?? config.RESEARCH_DAILY_LIMIT_PER_USER}${settings.dailyLimit === null ? " (default)" : ""} per member`,
        inline: true,
      },
      { name: "Channels", value: CHANNEL_KEYS.map((k) => `${k}: ${channels[k] ? `<#${channels[k]}>` : "not set"}`).join("\n") },
      {
        name: "Role rewards",
        value: rewards.length ? rewards.map(([role, pts]) => `<@&${role}>: ${pts} points`).join("\n") : "None",
      },
    );
  await interaction.editReply({ embeds: [embed] });
};

const configChannel: Handler = async (interaction, guildId) => {
  const type = interaction.options.getString("type", true) as ChannelKey;
  const channel = interaction.options.getChannel("channel", true);
  const settings = await getGuildSettings(guildId);
  await updateGuildSettings(guildId, { channels: { ...channelMap(settings), [type]: channel.id } as Record<string, string> });
  await interaction.editReply(`The **${type}** feed will now post in <#${channel.id}>. Make sure the bot can view and send messages and embed links there.`);
};

const configResearch: Handler = async (interaction, guildId) => {
  const enabled = interaction.options.getBoolean("enabled", true);
  await updateGuildSettings(guildId, { autoResearch: enabled });
  await interaction.editReply(`Research and web refresh are now **${enabled ? "on" : "off"}** on this server.`);
};

const configCooldown: Handler = async (interaction, guildId) => {
  const seconds = interaction.options.getInteger("seconds", true);
  await updateGuildSettings(guildId, { cooldownSeconds: seconds });
  await interaction.editReply(`Research cooldown set to **${seconds}s** per member.`);
};

const configLimit: Handler = async (interaction, guildId) => {
  const limit = interaction.options.getInteger("per_day", true);
  await updateGuildSettings(guildId, { dailyLimit: limit });
  await interaction.editReply(`Daily research limit set to **${limit}** per member.`);
};

const configRoleReward: Handler = async (interaction, guildId) => {
  const role = interaction.options.getRole("role", true);
  const points = interaction.options.getInteger("points", true);
  const rewards = { ...roleRewards(await getGuildSettings(guildId)) };
  if (points === 0) delete rewards[role.id];
  else rewards[role.id] = points;
  await updateGuildSettings(guildId, { roleRewards: rewards });
  await interaction.editReply(
    points === 0
      ? `Removed the reward for <@&${role.id}>.`
      : `Members will receive <@&${role.id}> at **${points}** points. The bot needs the Manage Roles permission and its own role must sit above this one.`,
  );
};

// ---------- sources ----------

const sourcesAdd: Handler = async (interaction) => {
  const url = interaction.options.getString("url", true).trim();
  if (!isHttpUrl(url)) {
    await interaction.editReply("The URL must start with http:// or https://.");
    return;
  }
  const type = interaction.options.getString("type") as OpportunityType | null;
  const source = await prisma.source.create({
    data: { label: interaction.options.getString("label", true).trim(), url, type },
  });
  await interaction.editReply(`Added source **#${source.ref}** (${source.label}). It is included in scheduled scans, or run one now with \`/admin sources scan\`.`);
};

const sourcesList: Handler = async (interaction) => {
  const sources = await prisma.source.findMany({ orderBy: { ref: "asc" }, take: 25 });
  if (sources.length === 0) {
    await interaction.editReply("No custom sources yet. Add one with `/admin sources add`.");
    return;
  }
  const lines = sources.map(
    (s) =>
      `**#${s.ref}** ${s.enabled ? "✅" : "⏸️"} ${clip(s.label, 40)}${s.type ? ` (${s.type.toLowerCase()})` : ""}\n${clip(s.url, 100)}\n` +
      (s.lastError ? `Last error: ${clip(s.lastError, 100)}` : s.lastScannedAt ? `Last scanned ${discordDate(s.lastScannedAt)}` : "Not scanned yet"),
  );
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Monitored sources").setDescription(clip(lines.join("\n\n"), 4000))] });
};

const sourcesRemove: Handler = async (interaction) => {
  const ref = interaction.options.getInteger("ref", true);
  const removed = await prisma.source.deleteMany({ where: { ref } });
  await interaction.editReply(removed.count > 0 ? `Removed source #${ref}.` : `No source #${ref}.`);
};

const sourcesToggle: Handler = async (interaction) => {
  const ref = interaction.options.getInteger("ref", true);
  const source = await prisma.source.findUnique({ where: { ref } });
  if (!source) {
    await interaction.editReply(`No source #${ref}.`);
    return;
  }
  await prisma.source.update({ where: { id: source.id }, data: { enabled: !source.enabled } });
  await interaction.editReply(`Source #${ref} is now **${source.enabled ? "paused" : "enabled"}**.`);
};

const sourcesScan: Handler = async (interaction) => {
  await runAutomationNow("scan-sources");
  await interaction.editReply("Scan started. It searches the web for all four opportunity types plus your sources, so it uses OpenAI credits. New approved listings are posted to your channels when it finishes.");
};

// ---------- opportunities ----------

const oppPending: Handler = async (interaction) => {
  const pending = await prisma.opportunity.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 8 });
  const extras = new Map(pending.filter((o) => o.scamNotes).map((o) => [o.id, `Warning signs: ${o.scamNotes}`]));
  await interaction.editReply({
    content: pending.length ? "Approve with `/admin opportunities approve ref:<number>` or reject with `reject`." : undefined,
    embeds: [opportunityListEmbed("Waiting for review", pending, extras, "Nothing is waiting for review.")],
  });
};

const oppApprove: Handler = async (interaction) => {
  const ref = interaction.options.getInteger("ref", true);
  const opportunity = await prisma.opportunity.findUnique({ where: { ref } });
  if (!opportunity) {
    await interaction.editReply(`No listing #${ref}.`);
    return;
  }
  const wasPending = opportunity.status === "PENDING";
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: { status: "APPROVED", isOpen: true, notifiedAt: null },
  });
  if (wasPending && opportunity.submittedById) {
    await awardPoints(opportunity.submittedById, 10, `Shared an opportunity: ${clip(opportunity.title, 80)}`);
  }
  await announceNewOpportunities(interaction.client);
  await interaction.editReply(`Approved **${opportunity.title}** (#${ref}) and posted it to the configured channels.`);
};

const oppReject: Handler = async (interaction) => {
  const ref = interaction.options.getInteger("ref", true);
  const opportunity = await prisma.opportunity.findUnique({ where: { ref } });
  if (!opportunity) {
    await interaction.editReply(`No listing #${ref}.`);
    return;
  }
  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { status: "REJECTED" } });
  await interaction.editReply(`Rejected **${opportunity.title}** (#${ref}). It stays in the database so the same listing is not re-added.`);
};

// ---------- users ----------

const usersInfo: Handler = async (interaction) => {
  const user = interaction.options.getUser("user", true);
  const member = await prisma.member.findUnique({ where: { discordId: user.id } });
  if (!member) {
    await interaction.editReply("That user has not used the bot yet.");
    return;
  }
  const [requests, applications, saved, watches] = await Promise.all([
    prisma.researchRequest.count({ where: { memberId: member.id } }),
    prisma.application.count({ where: { memberId: member.id } }),
    prisma.savedOpportunity.count({ where: { memberId: member.id } }),
    prisma.watch.count({ where: { memberId: member.id } }),
  ]);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Member: ${user.username}`)
    .addFields(
      { name: "Points", value: String(member.points), inline: true },
      { name: "Research requests", value: String(requests), inline: true },
      { name: "Applications tracked", value: String(applications), inline: true },
      { name: "Saved listings", value: String(saved), inline: true },
      { name: "Watching", value: String(watches), inline: true },
      { name: "Profile", value: member.skills.length ? clip(`${member.skills.join(", ")}${member.experienceLevel ? ` · ${member.experienceLevel}` : ""}`, 1024) : "No profile" },
    );
  await interaction.editReply({ embeds: [embed] });
};

const usersAward: Handler = async (interaction) => {
  const user = interaction.options.getUser("user", true);
  const points = interaction.options.getInteger("points", true);
  const reason = interaction.options.getString("reason", true).trim();
  const member = await upsertMember(user.id, user.username);
  const total = await awardPoints(member.id, points, `Admin: ${clip(reason, 120)}`);
  await interaction.editReply(`Gave <@${user.id}> **${points}** points (${reason}). They now have **${total}**.`);
};

// ---------- reports, analytics, pause ----------

const reportsRun: Handler = async (interaction) => {
  const kind = interaction.options.getString("kind", true) as DigestPeriod;
  const posted = await postDigest(interaction.client, kind);
  await interaction.editReply(
    posted > 0
      ? `Posted the ${kind} report (${posted} message${posted === 1 ? "" : "s"}).`
      : "Nothing was posted. Set a digests or jobs channel first with `/admin config channel`.",
  );
};

const analytics: Handler = async (interaction) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [members, requestGroups, oppGroups, pending, usage, failedRequests, failedRuns, researchCounts, automationCounts] =
    await Promise.all([
      prisma.member.count(),
      prisma.researchRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.opportunity.groupBy({ by: ["type"], where: { status: "APPROVED", isOpen: true }, _count: { _all: true } }),
      prisma.opportunity.count({ where: { status: "PENDING" } }),
      prisma.usageLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, webSearches: true, estCostUsd: true },
        _count: { _all: true },
      }),
      prisma.researchRequest.findMany({
        where: { status: "FAILED", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { kind: true, query: true, error: true },
      }),
      prisma.jobRun.findMany({ where: { status: "failed", startedAt: { gte: since } }, orderBy: { startedAt: "desc" }, take: 3 }),
      researchQueue.getJobCounts("waiting", "active", "failed"),
      automationQueue.getJobCounts("waiting", "active", "failed"),
    ]);

  const cost = usage._sum.estCostUsd ?? 0;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Analytics: last 7 days")
    .addFields(
      { name: "Members", value: String(members), inline: true },
      { name: "Pending review", value: String(pending), inline: true },
      {
        name: "Requests",
        value: requestGroups.length ? requestGroups.map((g) => `${g.status.toLowerCase()}: ${g._count._all}`).join("\n") : "None",
        inline: true,
      },
      {
        name: "Open listings",
        value: oppGroups.length ? oppGroups.map((g) => `${g.type.toLowerCase()}: ${g._count._all}`).join("\n") : "None",
        inline: true,
      },
      {
        name: "AI usage (estimate)",
        value: `${usage._count._all} calls • ${usage._sum.webSearches ?? 0} web searches\n${((usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0)).toLocaleString()} tokens • about $${cost.toFixed(2)}`,
        inline: true,
      },
      {
        name: "Queues",
        value: `Research: ${researchCounts.waiting} waiting, ${researchCounts.active} running, ${researchCounts.failed} failed\nAutomation: ${automationCounts.waiting} waiting, ${automationCounts.active} running, ${automationCounts.failed} failed`,
      },
      {
        name: "Recent failures",
        value: clip(
          [
            ...failedRequests.map((r) => `${r.kind.toLowerCase()} "${clip(r.query, 40)}": ${clip(r.error ?? "unknown error", 80)}`),
            ...failedRuns.map((r) => `${r.name}: ${clip(r.error ?? "unknown error", 80)}`),
          ].join("\n") || "None",
          1024,
        ),
      },
    )
    .setFooter({ text: "Cost is an estimate from the prices in your .env, not your OpenAI bill" });
  await interaction.editReply({ embeds: [embed] });
};

const pause: Handler = async (interaction, guildId) => {
  await updateGuildSettings(guildId, { paused: true });
  await interaction.editReply("⏸️ The bot is paused on this server. Commands (except help, health and admin) and automatic posts are off. Resume with `/admin resume`.");
};

const resume: Handler = async (interaction, guildId) => {
  await updateGuildSettings(guildId, { paused: false });
  await interaction.editReply("▶️ The bot is running again.");
};

const panelPost: Handler = async (interaction) => {
  const channel = interaction.channel;
  if (!channel || !channel.isSendable()) {
    await interaction.editReply("I can't post in this channel. Check my permissions.");
    return;
  }
  await channel.send(memberPanel());
  await interaction.editReply("Posted the button menu in this channel. Pin it so members can always find it.");
};

const controls: Handler = async (interaction) => {
  await interaction.editReply(adminPanel());
};

const HANDLERS: Record<string, Handler> = {
  panel: panelPost,
  controls,
  "config/view": configView,
  "config/channel": configChannel,
  "config/research": configResearch,
  "config/cooldown": configCooldown,
  "config/limit": configLimit,
  "config/role-reward": configRoleReward,
  "sources/add": sourcesAdd,
  "sources/list": sourcesList,
  "sources/remove": sourcesRemove,
  "sources/toggle": sourcesToggle,
  "sources/scan": sourcesScan,
  "opportunities/pending": oppPending,
  "opportunities/approve": oppApprove,
  "opportunities/reject": oppReject,
  "users/info": usersInfo,
  "users/award": usersAward,
  "reports/run": reportsRun,
  analytics,
  pause,
  resume,
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Server administration for Web3 Job Hunters AI")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommandGroup((g) =>
      g
        .setName("config")
        .setDescription("Bot settings")
        .addSubcommand((s) => s.setName("view").setDescription("Show the current settings"))
        .addSubcommand((s) =>
          s
            .setName("channel")
            .setDescription("Choose where the bot posts a feed")
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Which feed")
                .setRequired(true)
                .addChoices(...CHANNEL_KEYS.map((k) => ({ name: k, value: k }))),
            )
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("The channel")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("research")
            .setDescription("Turn research and web refresh on or off")
            .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("cooldown")
            .setDescription("Set the research cooldown per member")
            .addIntegerOption((o) => o.setName("seconds").setDescription("Seconds").setRequired(true).setMinValue(0).setMaxValue(3600)),
        )
        .addSubcommand((s) =>
          s
            .setName("limit")
            .setDescription("Set the daily research limit per member")
            .addIntegerOption((o) => o.setName("per_day").setDescription("Runs per day").setRequired(true).setMinValue(1).setMaxValue(200)),
        )
        .addSubcommand((s) =>
          s
            .setName("role-reward")
            .setDescription("Give a role to members who reach a points total (0 removes it)")
            .addRoleOption((o) => o.setName("role").setDescription("The role").setRequired(true))
            .addIntegerOption((o) => o.setName("points").setDescription("Points needed").setRequired(true).setMinValue(0).setMaxValue(100000)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("sources")
        .setDescription("Pages the bot scans for opportunities")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Add a page to scan")
            .addStringOption((o) => o.setName("label").setDescription("A name for it").setRequired(true).setMaxLength(60))
            .addStringOption((o) => o.setName("url").setDescription("Careers, jobs, grants or program page").setRequired(true))
            .addStringOption((o) => o.setName("type").setDescription("What it lists").addChoices(...TYPE_CHOICES)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("List sources"))
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove a source")
            .addIntegerOption((o) => o.setName("ref").setDescription("Source number").setRequired(true).setMinValue(1)),
        )
        .addSubcommand((s) =>
          s
            .setName("toggle")
            .setDescription("Pause or resume a source")
            .addIntegerOption((o) => o.setName("ref").setDescription("Source number").setRequired(true).setMinValue(1)),
        )
        .addSubcommand((s) => s.setName("scan").setDescription("Run a scan now")),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("opportunities")
        .setDescription("Review listings")
        .addSubcommand((s) => s.setName("pending").setDescription("Listings waiting for review"))
        .addSubcommand((s) =>
          s
            .setName("approve")
            .setDescription("Approve a listing")
            .addIntegerOption((o) => o.setName("ref").setDescription("Listing number").setRequired(true).setMinValue(1)),
        )
        .addSubcommand((s) =>
          s
            .setName("reject")
            .setDescription("Reject a listing")
            .addIntegerOption((o) => o.setName("ref").setDescription("Listing number").setRequired(true).setMinValue(1)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("users")
        .setDescription("Members")
        .addSubcommand((s) =>
          s
            .setName("info")
            .setDescription("See a member's activity")
            .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("award")
            .setDescription("Give or remove community points")
            .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true))
            .addIntegerOption((o) => o.setName("points").setDescription("Points (negative removes)").setRequired(true).setMinValue(-500).setMaxValue(1000))
            .addStringOption((o) => o.setName("reason").setDescription("Why").setRequired(true).setMaxLength(120)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("reports")
        .setDescription("Scheduled reports")
        .addSubcommand((s) =>
          s
            .setName("run")
            .setDescription("Post a report now")
            .addStringOption((o) =>
              o
                .setName("kind")
                .setDescription("Which report")
                .setRequired(true)
                .addChoices({ name: "Daily", value: "daily" }, { name: "Weekly", value: "weekly" }, { name: "Monthly", value: "monthly" }),
            ),
        ),
    )
    .addSubcommand((s) => s.setName("analytics").setDescription("Usage, queues, failures and estimated AI cost"))
    .addSubcommand((s) => s.setName("pause").setDescription("Pause the bot on this server"))
    .addSubcommand((s) => s.setName("resume").setDescription("Resume the bot on this server"))
    .addSubcommand((s) => s.setName("panel").setDescription("Post the member button menu in this channel"))
    .addSubcommand((s) => s.setName("controls").setDescription("Open these admin settings as buttons")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply("Only server administrators can use this command.");
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const handler = HANDLERS[group ? `${group}/${sub}` : sub];
    if (!handler) {
      await interaction.editReply("Unknown admin command.");
      return;
    }
    await handler(interaction, interaction.guildId);
  },
};

export default command;
