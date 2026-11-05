import type { ApplicationStatus, Prisma } from "@prisma/client";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../db.js";
import { upsertMember } from "../services/members.js";
import { clip, discordDate, isHttpUrl, parseDateInput } from "../utils.js";
import type { Command } from "./types.js";

const STATUSES: { name: string; value: ApplicationStatus }[] = [
  { name: "Saved", value: "SAVED" },
  { name: "Preparing application", value: "PREPARING" },
  { name: "Applied", value: "APPLIED" },
  { name: "Assessment", value: "ASSESSMENT" },
  { name: "Interview", value: "INTERVIEW" },
  { name: "Accepted", value: "ACCEPTED" },
  { name: "Rejected", value: "REJECTED" },
];
const label = (s: ApplicationStatus) => STATUSES.find((x) => x.value === s)?.name ?? s;
const DAY = 24 * 60 * 60 * 1000;
const MAX_APPLICATIONS = 200;

function stamp(note: string): string {
  return `${new Date().toISOString().slice(0, 10)}: ${note}`;
}

async function add(interaction: ChatInputCommandInteraction, memberId: string) {
  const o = interaction.options;
  let title = o.getString("title");
  let company = o.getString("company");
  const listing = o.getInteger("listing");
  const status = (o.getString("status") as ApplicationStatus | null) ?? "SAVED";
  const deadlineInput = o.getString("deadline");
  const link = o.getString("link");
  const note = o.getString("note");

  let deadline = parseDateInput(deadlineInput);
  if (deadlineInput && !deadline) {
    await interaction.editReply("The deadline must look like 2026-12-31 (year-month-day).");
    return;
  }
  if (link && !isHttpUrl(link)) {
    await interaction.editReply("The link must start with http:// or https://.");
    return;
  }

  let opportunityId: string | null = null;
  if (listing !== null) {
    const opp = await prisma.opportunity.findFirst({ where: { ref: listing, status: "APPROVED" } });
    if (!opp) {
      await interaction.editReply(`I couldn't find listing #${listing}.`);
      return;
    }
    opportunityId = opp.id;
    title ??= opp.title;
    company ??= opp.projectName;
    deadline ??= opp.deadline;
  }
  if (!title || !company) {
    await interaction.editReply("Give me a title and company, or a listing number to fill them in.");
    return;
  }
  if ((await prisma.application.count({ where: { memberId } })) >= MAX_APPLICATIONS) {
    await interaction.editReply(`You can track up to ${MAX_APPLICATIONS} applications. Remove old ones with \`/track remove\`.`);
    return;
  }

  const app = await prisma.application.create({
    data: {
      memberId,
      opportunityId,
      title,
      company,
      status,
      deadline,
      followUpAt: status === "APPLIED" ? new Date(Date.now() + 7 * DAY) : null,
      notes: note ? stamp(note) : null,
      links: link ? [link] : [],
      events: { create: { status, note: "Added" } },
    },
  });
  await interaction.editReply(
    `Tracking **${app.title}** at ${app.company} as application **#${app.ref}** (${label(status)}). Update it with \`/track update id:${app.ref}\`.`,
  );
}

async function update(interaction: ChatInputCommandInteraction, memberId: string) {
  const o = interaction.options;
  const ref = o.getInteger("id", true);
  const app = await prisma.application.findFirst({ where: { ref, memberId } });
  if (!app) {
    await interaction.editReply(`I couldn't find application #${ref} in your tracker.`);
    return;
  }

  const status = o.getString("status") as ApplicationStatus | null;
  const note = o.getString("note");
  const deadlineInput = o.getString("deadline");
  const followUpDays = o.getInteger("followup_days");
  const link = o.getString("link");

  const deadline = parseDateInput(deadlineInput);
  if (deadlineInput && !deadline) {
    await interaction.editReply("The deadline must look like 2026-12-31 (year-month-day).");
    return;
  }
  if (link && !isHttpUrl(link)) {
    await interaction.editReply("The link must start with http:// or https://.");
    return;
  }

  const data: Prisma.ApplicationUpdateInput = {};
  if (status && status !== app.status) {
    data.status = status;
    if (status === "APPLIED" && !app.followUpAt && followUpDays === null) {
      data.followUpAt = new Date(Date.now() + 7 * DAY);
      data.followUpRemindedAt = null;
    }
  }
  if (deadline) {
    data.deadline = deadline;
    data.deadlineRemindedAt = null;
  }
  if (followUpDays !== null) {
    data.followUpAt = new Date(Date.now() + followUpDays * DAY);
    data.followUpRemindedAt = null;
  }
  if (note) data.notes = clip(`${app.notes ? `${app.notes}\n` : ""}${stamp(note)}`, 3000);
  if (link) data.links = { push: link };

  if (Object.keys(data).length === 0) {
    await interaction.editReply("Nothing to change. Add a status, note, deadline, follow-up or link.");
    return;
  }

  await prisma.application.update({ where: { id: app.id }, data });
  if (status && status !== app.status) {
    await prisma.applicationEvent.create({ data: { applicationId: app.id, status, note: note ?? null } });
  }
  await interaction.editReply(`Updated application **#${ref}**${status ? ` (now ${label(status)})` : ""}.`);
}

async function list(interaction: ChatInputCommandInteraction, memberId: string) {
  const status = interaction.options.getString("status") as ApplicationStatus | null;
  const apps = await prisma.application.findMany({
    where: { memberId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });
  if (apps.length === 0) {
    await interaction.editReply("No applications yet. Add one with `/track add`.");
    return;
  }
  const lines = apps.map(
    (a) =>
      `**#${a.ref}** ${clip(a.title, 60)} · ${clip(a.company, 40)}\n${label(a.status)}${a.deadline ? ` · ⏰ ${discordDate(a.deadline)}` : ""}${a.followUpAt && ["APPLIED", "ASSESSMENT", "INTERVIEW"].includes(a.status) ? ` · 📬 follow up ${discordDate(a.followUpAt)}` : ""}`,
  );
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Your applications").setDescription(clip(lines.join("\n\n"), 4000))],
  });
}

async function view(interaction: ChatInputCommandInteraction, memberId: string) {
  const ref = interaction.options.getInteger("id", true);
  const app = await prisma.application.findFirst({
    where: { ref, memberId },
    include: { events: { orderBy: { createdAt: "desc" }, take: 8 }, opportunity: true },
  });
  if (!app) {
    await interaction.editReply(`I couldn't find application #${ref} in your tracker.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`#${app.ref} ${clip(app.title, 200)}`)
    .setDescription(`${app.company} · **${label(app.status)}**`)
    .addFields(
      { name: "Deadline", value: app.deadline ? discordDate(app.deadline) : "Not set", inline: true },
      { name: "Follow-up", value: app.followUpAt ? discordDate(app.followUpAt) : "Not set", inline: true },
      { name: "Listing", value: app.opportunity ? `#${app.opportunity.ref}` : "None", inline: true },
      { name: "Links", value: clip(app.links.length ? app.links.join("\n") : "None", 1024) },
      { name: "Notes", value: clip(app.notes ?? "None", 1024) },
      {
        name: "History",
        value: clip(
          app.events.map((e) => `${e.createdAt.toISOString().slice(0, 10)} · ${label(e.status)}${e.note ? ` · ${e.note}` : ""}`).join("\n") || "None",
          1024,
        ),
      },
    );
  await interaction.editReply({ embeds: [embed] });
}

async function remove(interaction: ChatInputCommandInteraction, memberId: string) {
  const ref = interaction.options.getInteger("id", true);
  const removed = await prisma.application.deleteMany({ where: { ref, memberId } });
  await interaction.editReply(removed.count > 0 ? `Removed application #${ref}.` : `I couldn't find application #${ref}.`);
}

const statusOption = (o: import("discord.js").SlashCommandStringOption) =>
  o.setName("status").setDescription("Application status").addChoices(...STATUSES);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Track your applications, deadlines and follow-ups")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add an application")
        .addStringOption((o) => o.setName("title").setDescription("Role or program").setMaxLength(150))
        .addStringOption((o) => o.setName("company").setDescription("Project or company").setMaxLength(100))
        .addIntegerOption((o) => o.setName("listing").setDescription("Listing number, fills in title and company").setMinValue(1))
        .addStringOption(statusOption)
        .addStringOption((o) => o.setName("deadline").setDescription("Deadline as YYYY-MM-DD"))
        .addStringOption((o) => o.setName("link").setDescription("Link to your submitted work or the application"))
        .addStringOption((o) => o.setName("note").setDescription("A note").setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName("update")
        .setDescription("Update an application")
        .addIntegerOption((o) => o.setName("id").setDescription("Application number").setRequired(true).setMinValue(1))
        .addStringOption(statusOption)
        .addStringOption((o) => o.setName("note").setDescription("Add a note").setMaxLength(500))
        .addStringOption((o) => o.setName("deadline").setDescription("Deadline as YYYY-MM-DD"))
        .addIntegerOption((o) =>
          o.setName("followup_days").setDescription("Remind me to follow up in this many days").setMinValue(1).setMaxValue(90),
        )
        .addStringOption((o) => o.setName("link").setDescription("Add a link to submitted work")),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List your applications").addStringOption(statusOption),
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("See one application with its notes and history")
        .addIntegerOption((o) => o.setName("id").setDescription("Application number").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove an application")
        .addIntegerOption((o) => o.setName("id").setDescription("Application number").setRequired(true).setMinValue(1)),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await upsertMember(interaction.user.id, interaction.user.username);
    switch (interaction.options.getSubcommand()) {
      case "add":
        return add(interaction, member.id);
      case "update":
        return update(interaction, member.id);
      case "list":
        return list(interaction, member.id);
      case "view":
        return view(interaction, member.id);
      default:
        return remove(interaction, member.id);
    }
  },
};

export default command;
