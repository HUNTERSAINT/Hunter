import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { ASSIST_KINDS } from "../ai/assistant.js";
import { CONTENT_FORMATS } from "../ai/content.js";
import { commands } from "../commands/index.js";
import { gateMessage } from "../gate.js";
import { reportError } from "../monitoring.js";
import { CHANNEL_KEYS } from "../services/guild.js";
import { asCommandInteraction, type CommandSpec } from "./adapter.js";
import { applyModal, buildModal, contentModal, MODALS, shareModal } from "./modals.js";
import { profileMoreRow } from "./panels.js";

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

type Source = ButtonInteraction | ModalSubmitInteraction | ChannelSelectMenuInteraction;

const SHARE_TYPES = [
  { label: "Job", value: "JOB" },
  { label: "Ambassador or contributor program", value: "AMBASSADOR" },
  { label: "Bounty or gig", value: "BOUNTY" },
  { label: "Grant", value: "GRANT" },
];

/** Buttons that run a command straight away. */
const DIRECT: Record<string, CommandSpec> = {
  jobs: { commandName: "jobs" },
  ambassadors: { commandName: "ambassadors" },
  bounties: { commandName: "bounties" },
  match: { commandName: "match" },
  trending: { commandName: "trending" },
  leaderboard: { commandName: "leaderboard" },
  watchlist: { commandName: "watch" },
  profile_view: { commandName: "profile", sub: "view" },
  track_list: { commandName: "track", sub: "list" },
  saved: { commandName: "saved", sub: "list" },
  digest_daily: { commandName: "digest", values: { period: "daily" } },
  digest_weekly: { commandName: "digest", values: { period: "weekly" } },
  help: { commandName: "help" },
  health: { commandName: "health" },
};

/** Buttons that open a form. Value is the key in MODALS. */
const OPEN_MODAL: Record<string, string> = {
  research: "research",
  compare: "compare",
  search: "search",
  projects: "projects",
  watch: "watch",
  scam: "scam",
  introduce: "introduce",
  members: "members",
  track_add: "track_add",
  profile_edit: "profile",
  profile2: "profile2",
  c_reply: "c_reply",
  c_kol: "c_kol",
  c_batch: "c_batch",
};

const ADMIN_DIRECT: Record<string, CommandSpec> = {
  analytics: { commandName: "admin", sub: "analytics" },
  config_view: { commandName: "admin", group: "config", sub: "view" },
  pending: { commandName: "admin", group: "opportunities", sub: "pending" },
  sources: { commandName: "admin", group: "sources", sub: "list" },
  scan: { commandName: "admin", group: "sources", sub: "scan" },
  setup: { commandName: "admin", sub: "setup" },
  studio: { commandName: "studio" },
  pause: { commandName: "admin", sub: "pause" },
  resume: { commandName: "admin", sub: "resume" },
  research_on: { commandName: "admin", group: "config", sub: "research", values: { enabled: true } },
  research_off: { commandName: "admin", group: "config", sub: "research", values: { enabled: false } },
  report_daily: { commandName: "admin", group: "reports", sub: "run", values: { kind: "daily" } },
  report_weekly: { commandName: "admin", group: "reports", sub: "run", values: { kind: "weekly" } },
  report_monthly: { commandName: "admin", group: "reports", sub: "run", values: { kind: "monthly" } },
};

const ADMIN_MODAL: Record<string, string> = {
  approve: "a_approve",
  reject: "a_reject",
  cooldown: "a_cooldown",
  limit: "a_limit",
};

async function run(interaction: Source, spec: CommandSpec): Promise<void> {
  const blocked = await gateMessage(spec.commandName, interaction.guildId);
  if (blocked) {
    await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
    return;
  }
  const command = commandMap.get(spec.commandName);
  if (!command) return;
  await command.execute(asCommandInteraction(interaction, spec));
}

function tell(interaction: Source, content: string) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function menu(customId: string, placeholder: string, options: { label: string; value: string }[]) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options),
  );
}

// ---------- buttons ----------

async function onButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith("hja:")) {
    const action = id.slice(4);
    if (ADMIN_DIRECT[action]) return run(interaction, ADMIN_DIRECT[action]);
    if (ADMIN_MODAL[action]) {
      const key = ADMIN_MODAL[action];
      return interaction.showModal(buildModal(`hjm:${key}`, MODALS[key]));
    }
    if (action === "channel") {
      await interaction.reply({
        content: "Which feed do you want to set?",
        components: [menu("hjs:a_feed", "Choose a feed", CHANNEL_KEYS.map((k) => ({ label: k, value: k })))],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  const action = id.slice(3);
  if (DIRECT[action]) return run(interaction, DIRECT[action]);
  if (OPEN_MODAL[action]) {
    const key = OPEN_MODAL[action];
    return interaction.showModal(buildModal(`hjm:${key}`, MODALS[key]));
  }

  // These need a choice first, then a form.
  if (action === "apply") {
    await interaction.reply({
      content: "What would you like drafted?",
      components: [menu("hjs:apply", "Choose a draft type", Object.entries(ASSIST_KINDS).map(([value, k]) => ({ label: k.label, value })))],
      flags: MessageFlags.Ephemeral,
    });
  } else if (action === "content") {
    await interaction.reply({
      content: "What kind of content?",
      components: [menu("hjs:content", "Choose a format", Object.entries(CONTENT_FORMATS).map(([value, f]) => ({ label: f.label, value })))],
      flags: MessageFlags.Ephemeral,
    });
  } else if (action === "share") {
    await interaction.reply({
      content: "What are you sharing?",
      components: [menu("hjs:share", "Choose a type", SHARE_TYPES)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ---------- menus ----------

async function onSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];

  if (interaction.customId === "hjs:apply" && value in ASSIST_KINDS) {
    const kind = ASSIST_KINDS[value as keyof typeof ASSIST_KINDS];
    return interaction.showModal(buildModal(`hjm:apply:${value}`, applyModal(kind.label)));
  }
  if (interaction.customId === "hjs:content" && value in CONTENT_FORMATS) {
    const format = CONTENT_FORMATS[value as keyof typeof CONTENT_FORMATS];
    return interaction.showModal(buildModal(`hjm:content:${value}`, contentModal(format.label)));
  }
  if (interaction.customId === "hjs:share") {
    const type = SHARE_TYPES.find((t) => t.value === value);
    if (type) return interaction.showModal(buildModal(`hjm:share:${value}`, shareModal(type.label)));
  }
  if (interaction.customId === "hjs:a_feed" && (CHANNEL_KEYS as readonly string[]).includes(value)) {
    const picker = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`hjs:a_chan:${value}`)
        .setPlaceholder(`Choose the channel for ${value}`)
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    );
    await interaction.update({ content: `Choose the channel for the **${value}** feed:`, components: [picker] });
  }
}

async function onChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const feed = interaction.customId.replace("hjs:a_chan:", "");
  if (!(CHANNEL_KEYS as readonly string[]).includes(feed)) return;
  await run(interaction, {
    commandName: "admin",
    group: "config",
    sub: "channel",
    values: { type: feed, channel: { id: interaction.values[0] } },
  });
}

// ---------- forms ----------

function field(interaction: ModalSubmitInteraction, id: string): string {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return "";
  }
}

async function onModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, key, arg] = interaction.customId.split(":");
  const f = (id: string) => field(interaction, id);

  switch (key) {
    case "research":
      return run(interaction, { commandName: "research", values: { project: f("project") } });
    case "compare":
      return run(interaction, { commandName: "compare", values: { project1: f("project1"), project2: f("project2") } });
    case "search":
      return run(interaction, { commandName: "opportunities", values: { topic: f("topic") } });
    case "projects":
      return run(interaction, { commandName: "projects", sub: "search", values: { query: f("query") } });
    case "watch":
      return run(interaction, { commandName: "watch", values: { project: f("project") } });
    case "scam":
      return run(interaction, { commandName: "scamcheck", values: { message: f("message"), link: f("link") } });
    case "introduce":
      return run(interaction, { commandName: "introduce", values: { text: f("text") } });
    case "members":
      return run(interaction, { commandName: "members", values: { skill: f("skill"), ecosystem: f("ecosystem") } });
    case "track_add":
      return run(interaction, {
        commandName: "track",
        sub: "add",
        values: { title: f("title"), company: f("company"), deadline: f("deadline"), link: f("link"), note: f("note") },
      });

    case "profile": {
      await run(interaction, {
        commandName: "profile",
        sub: "set",
        values: {
          skills: f("skills"),
          roles: f("roles"),
          ecosystems: f("ecosystems"),
          portfolio: f("portfolio"),
          github: f("github"),
        },
      });
      await interaction
        .followUp({
          content: "Want to add your level, work style, salary, CV or whether other members can find you?",
          components: [profileMoreRow()],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
      return;
    }

    case "profile2": {
      const level = f("level").toLowerCase();
      const arrangement = f("arrangement").toLowerCase().replace("on-site", "onsite");
      const discoverable = f("discoverable").toLowerCase();
      if (level && !["entry", "junior", "mid", "senior"].includes(level)) {
        return void (await tell(interaction, "Level must be entry, junior, mid or senior."));
      }
      if (arrangement && !["remote", "hybrid", "onsite"].includes(arrangement)) {
        return void (await tell(interaction, "Work style must be remote, hybrid or onsite."));
      }
      if (discoverable && !["yes", "no"].includes(discoverable)) {
        return void (await tell(interaction, "Findable must be yes or no."));
      }
      return run(interaction, {
        commandName: "profile",
        sub: "set",
        values: {
          level,
          arrangement,
          salary: f("salary"),
          cv: f("cv"),
          ...(discoverable ? { discoverable: discoverable === "yes" } : {}),
        },
      });
    }

    case "apply":
      if (!(arg in ASSIST_KINDS)) return;
      return run(interaction, {
        commandName: "apply",
        values: { kind: arg, target: f("target"), details: f("details") },
      });

    case "content":
      if (!(arg in CONTENT_FORMATS)) return;
      return run(interaction, { commandName: "content", values: { project: f("project"), format: arg } });

    case "share":
      if (!SHARE_TYPES.some((t) => t.value === arg)) return;
      return run(interaction, {
        commandName: "share",
        values: { type: arg, title: f("title"), project: f("project"), link: f("link"), details: f("details") },
      });

    case "c_reply":
      return run(interaction, { commandName: "reply", values: { tweet: f("tweet") } });
    case "c_kol":
      return run(interaction, { commandName: "kol", values: { project: f("project"), links: f("links"), notes: f("notes") } });
    case "c_batch":
      return run(interaction, {
        commandName: "batch",
        values: { days: Number(f("days")) || 1, focus: f("focus"), notes: f("notes") },
      });

    case "a_approve":
    case "a_reject": {
      const ref = Number(f("ref"));
      if (!Number.isInteger(ref) || ref < 1) return void (await tell(interaction, "Enter the listing number, like 12."));
      return run(interaction, {
        commandName: "admin",
        group: "opportunities",
        sub: key === "a_approve" ? "approve" : "reject",
        values: { ref },
      });
    }

    case "a_cooldown": {
      const seconds = Number(f("seconds"));
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
        return void (await tell(interaction, "Enter a whole number of seconds from 0 to 3600."));
      }
      return run(interaction, { commandName: "admin", group: "config", sub: "cooldown", values: { seconds } });
    }

    case "a_limit": {
      const perDay = Number(f("per_day"));
      if (!Number.isInteger(perDay) || perDay < 1 || perDay > 200) {
        return void (await tell(interaction, "Enter a whole number from 1 to 200."));
      }
      return run(interaction, { commandName: "admin", group: "config", sub: "limit", values: { per_day: perDay } });
    }
  }
}

/** Handles every button, form and menu from the bot's panels. Ignores anything else. */
export async function handleComponent(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isButton() && (interaction.customId.startsWith("hj:") || interaction.customId.startsWith("hja:"))) {
      return await onButton(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("hjm:")) {
      return await onModal(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("hjs:")) {
      return await onSelect(interaction);
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("hjs:a_chan:")) {
      return await onChannelSelect(interaction);
    }
  } catch (err) {
    reportError(err, { component: "customId" in interaction ? interaction.customId : "unknown" });
    const message = "Something went wrong with that button. Please try again.";
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply(message);
        else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // the interaction may have expired
    }
  }
}
