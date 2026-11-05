import type { Opportunity } from "@prisma/client";
import { EmbedBuilder } from "discord.js";
import { clip, discordDate, isHttpUrl } from "./utils.js";

const COLOR = 0x5865f2;

export const TYPE_LABEL: Record<Opportunity["type"], string> = {
  JOB: "💼 Job",
  AMBASSADOR: "🏆 Ambassador program",
  BOUNTY: "🎯 Bounty / gig",
  GRANT: "🏛️ Grant",
};

export const REWARD_LABEL: Record<Opportunity["rewardType"], string> = {
  CASH: "Cash",
  TOKEN: "Token",
  POINTS: "Points",
  GRANT: "Grant",
  UNPAID: "Unpaid (exposure only)",
  UNKNOWN: "Not stated",
};

function locationText(o: Opportunity): string | null {
  if (o.remote === true) return "Remote";
  if (o.remote === false) return o.location ?? "On-site";
  return o.location;
}

function rewardText(o: Opportunity): string | null {
  if (o.compensation) return o.compensation;
  return o.rewardType !== "UNKNOWN" ? REWARD_LABEL[o.rewardType] : null;
}

/** Compact two-line summary used in lists. */
export function opportunityLine(o: Opportunity, extra?: string): string {
  const reward = rewardText(o);
  const bits = [
    locationText(o),
    reward ? `💰 ${clip(reward, 40)}` : null,
    o.deadline ? `⏰ ${discordDate(o.deadline)}` : null,
    o.entryLevel ? "🌱 Entry-level" : null,
    o.noDegree ? "🎓 No degree required" : null,
    o.verified ? "✅ Verified" : null,
  ].filter(Boolean);
  const link = o.applyUrl && isHttpUrl(o.applyUrl) ? ` · [Apply](${o.applyUrl})` : "";
  const icon = TYPE_LABEL[o.type].split(" ")[0];
  return (
    `**#${o.ref}** ${icon} **${clip(o.title, 80)}** · ${clip(o.projectName, 40)}\n` +
    `${bits.join(" · ") || "Details not stated"}${link}` +
    (extra ? `\n_${clip(extra, 120)}_` : "")
  );
}

/** A list of listings in one embed. `extras` adds a note under a listing, keyed by its id. */
export function opportunityListEmbed(
  title: string,
  list: Opportunity[],
  extras?: Map<string, string>,
  emptyText = "Nothing to show yet.",
): EmbedBuilder {
  const body =
    list.length === 0
      ? emptyText
      : list.map((o) => opportunityLine(o, extras?.get(o.id))).join("\n\n");
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(clip(title, 250))
    .setDescription(clip(body, 4000))
    .setFooter({ text: "Use /saved add ref:<number> to keep a listing • Always apply through the official link" });
}

/** An alert-style card for one listing. `detailed` adds eligibility, duties and the application process. */
export function opportunityEmbed(
  o: Opportunity,
  opts: { heading?: string; detailed?: boolean } = {},
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(o.verified ? 0x57f287 : 0xfee75c)
    .setTitle(clip(opts.heading ?? "New Web3 opportunity detected", 250))
    .setDescription(
      `${o.verified ? "✅ **Verified listing**" : "⚠️ **Unverified listing.** Check the official source before applying."}\n` +
        `**${clip(o.title, 150)}**, ${clip(o.projectName, 80)}\n${TYPE_LABEL[o.type]}`,
    );

  const reward = rewardText(o);
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  const location = locationText(o);
  if (location) fields.push({ name: "Location", value: location, inline: true });
  if (reward) fields.push({ name: "Compensation", value: clip(reward, 200), inline: true });
  if (o.experience) fields.push({ name: "Experience", value: clip(o.experience, 200), inline: true });
  fields.push({ name: "Deadline", value: o.deadline ? discordDate(o.deadline) : "Not stated", inline: true });
  if (o.entryLevel || o.noDegree) {
    fields.push({
      name: "Entry barriers",
      value: [o.entryLevel ? "Entry-level friendly" : null, o.noDegree ? "No degree required" : null]
        .filter(Boolean)
        .join(" • "),
      inline: true,
    });
  }
  if (opts.detailed) {
    if (o.description) fields.push({ name: "About", value: clip(o.description, 700) });
    if (o.eligibility) fields.push({ name: "Eligibility", value: clip(o.eligibility, 500) });
    if (o.responsibilities) fields.push({ name: "Responsibilities", value: clip(o.responsibilities, 700) });
    if (o.applicationProcess) fields.push({ name: "How to apply", value: clip(o.applicationProcess, 500) });
  }
  fields.push({
    name: "Application",
    value: o.applyUrl && isHttpUrl(o.applyUrl) ? `[Official application link](${o.applyUrl})` : "No direct link found",
  });
  if (o.scamRisk !== "none" && o.scamNotes) {
    fields.push({ name: "⚠️ Warning signs noticed", value: clip(`${o.scamNotes}. These are indicators, not proof.`, 600) });
  }

  embed.addFields(fields);
  embed.setFooter({
    text: `Listing #${o.ref} • Last verified ${o.lastVerifiedAt.toISOString().slice(0, 10)} • /saved add ref:${o.ref}`,
  });
  return embed;
}
