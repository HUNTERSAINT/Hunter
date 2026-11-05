import { EmbedBuilder } from "discord.js";
import type { Comparison, ResearchReport } from "./ai/schema.js";
import { SECTION_KEYS, SECTION_LABELS } from "./ai/schema.js";
import { clip, isHttpUrl } from "./utils.js";

const COLOR = 0x5865f2;
const WARN = 0xed4245;

// Discord limits the combined size of all embeds in ONE message to 6000 characters,
// so every embed built here stays well under that and is sent as its own message.
const EMBED_BUDGET = 5000;

type Field = { name: string; value: string };

function bullets(label: string, items: string[]): string {
  if (items.length === 0) return "";
  return `**${label}:** ${items.slice(0, 3).join(" • ")}`;
}

function sectionText(section: ResearchReport["sections"][keyof ResearchReport["sections"]]): string {
  const lines = [
    section.summary,
    bullets("Verified", section.verified),
    bullets("Project claims", section.claimed),
    bullets("Not found", section.unknown),
  ].filter(Boolean);
  return clip(lines.join("\n"), 1024);
}

/** Packs fields into as many embeds as needed, keeping each under EMBED_BUDGET characters. */
function packFields(first: EmbedBuilder, firstSize: number, title: string, fields: Field[]): EmbedBuilder[] {
  const embeds = [first];
  let current = first;
  let size = firstSize;
  let count = 0;

  for (const field of fields) {
    const fieldSize = field.name.length + field.value.length;
    if (size + fieldSize > EMBED_BUDGET || count >= 24) {
      current = new EmbedBuilder().setColor(COLOR).setTitle(clip(`${title} (continued)`, 250));
      embeds.push(current);
      size = title.length + 12;
      count = 0;
    }
    current.addFields({ name: field.name, value: field.value });
    size += fieldSize;
    count += 1;
  }
  return embeds;
}

export function buildResearchEmbeds(
  report: ResearchReport,
  meta: { cached: boolean; researchedAt: Date },
): EmbedBuilder[] {
  const title = `🔬 ${clip(report.projectName, 200)}`;
  const intro = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(
      clip(
        `${report.oneLiner}\n\n**Overall confidence:** ${report.overallConfidence}` +
          `\n*Verified = confirmed by a primary or independent source. Project claims = stated by the project, not independently confirmed.*`,
        1500,
      ),
    );
  if (report.website && isHttpUrl(report.website)) intro.setURL(report.website);

  const introSize = title.length + 1500;
  const fields: Field[] = SECTION_KEYS.map((key) => ({
    name: SECTION_LABELS[key],
    value: sectionText(report.sections[key]),
  }));

  const embeds = packFields(intro, introSize, title, fields);

  // Closing embed: red flags, opportunities, sources.
  const closing = new EmbedBuilder().setColor(report.redFlags.length > 0 ? WARN : COLOR);
  closing.setTitle(clip(`${report.projectName}: flags, opportunities and sources`, 250));

  closing.addFields({
    name: "⚠️ Red flags",
    value:
      report.redFlags.length === 0
        ? "None found with concrete evidence. Missing information is not treated as a red flag."
        : clip(
            report.redFlags
              .slice(0, 5)
              .map((f) => `• **${f.flag}** (${f.confidence} confidence): ${f.evidence}`)
              .join("\n"),
            1024,
          ),
  });

  if (report.opportunityNotes.length > 0) {
    closing.addFields({
      name: "💼 Ways to get involved",
      value: clip(report.opportunityNotes.slice(0, 6).map((n) => `• ${n}`).join("\n"), 1024),
    });
  }

  const links = report.sources.filter((s) => isHttpUrl(s.url)).slice(0, 8);
  if (links.length > 0) {
    closing.addFields({
      name: "🔗 Sources",
      value: clip(links.map((s) => `• [${clip(s.title, 60)}](${s.url})`).join("\n"), 1024),
    });
  }

  const when = meta.researchedAt.toISOString().slice(0, 10);
  closing.setFooter({
    text: `${meta.cached ? "Saved research" : "Fresh research"} • ${when} • AI-generated, double-check before acting`,
  });
  embeds.push(closing);
  return embeds;
}

export function buildCompareEmbeds(nameA: string, nameB: string, cmp: Comparison): EmbedBuilder[] {
  const title = `⚖️ ${clip(nameA, 90)} vs ${clip(nameB, 90)}`;
  const intro = new EmbedBuilder().setColor(COLOR).setTitle(title).setDescription(clip(cmp.summary, 1800));

  const fields: Field[] = [
    ...cmp.dimensions.map((d) => ({
      name: clip(d.name, 250),
      value: clip(`**${nameA}:** ${d.projectA}\n**${nameB}:** ${d.projectB}`, 1024),
    })),
    ...(cmp.bestFor.length > 0
      ? [
          {
            name: "🎯 Best for…",
            value: clip(
              cmp.bestFor
                .slice(0, 6)
                .map((b) => `• **${b.contributorType}:** ${b.recommendation}. ${b.reason}`)
                .join("\n"),
              1024,
            ),
          },
        ]
      : []),
    {
      name: `⚠️ Risks: ${clip(nameA, 40)}`,
      value: clip(cmp.risks.projectA.map((r) => `• ${r}`).join("\n") || "None identified in the research.", 1024),
    },
    {
      name: `⚠️ Risks: ${clip(nameB, 40)}`,
      value: clip(cmp.risks.projectB.map((r) => `• ${r}`).join("\n") || "None identified in the research.", 1024),
    },
  ];

  if (cmp.caveats.length > 0) {
    fields.push({
      name: "Caveats",
      value: clip(cmp.caveats.slice(0, 5).map((c) => `• ${c}`).join("\n"), 1024),
    });
  }

  const embeds = packFields(intro, title.length + 1800, title, fields);
  embeds[embeds.length - 1].setFooter({
    text: "AI-generated from saved research reports. Double-check before acting.",
  });
  return embeds;
}
