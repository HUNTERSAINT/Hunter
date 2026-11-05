import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export type InputSpec = {
  id: string;
  label: string;
  paragraph?: boolean;
  required?: boolean;
  placeholder?: string;
  max?: number;
};
export type ModalSpec = { title: string; inputs: InputSpec[] };

const project = (label = "Project name, website or X profile"): InputSpec => ({
  id: "project",
  label,
  required: true,
  max: 200,
});

/** Forms for buttons that need typed input. Keys match the `hjm:<key>` part of the form's id. */
export const MODALS: Record<string, ModalSpec> = {
  research: { title: "Research a project", inputs: [project()] },
  compare: {
    title: "Compare two projects",
    inputs: [
      { id: "project1", label: "First project", required: true, max: 200 },
      { id: "project2", label: "Second project", required: true, max: 200 },
    ],
  },
  search: {
    title: "Search listings",
    inputs: [{ id: "topic", label: "Keywords (e.g. solidity, writing)", required: false, max: 100 }],
  },
  projects: {
    title: "Search saved research",
    inputs: [{ id: "query", label: "Name or keyword", required: true, max: 100 }],
  },
  watch: { title: "Watch a project", inputs: [project("Project name")] },
  scam: {
    title: "Scam check",
    inputs: [
      { id: "message", label: "Paste the offer, DM or announcement", paragraph: true, required: true, max: 4000 },
      { id: "link", label: "A link to check (optional)", required: false, max: 300 },
    ],
  },
  introduce: {
    title: "Introduce yourself",
    inputs: [
      { id: "text", label: "Who you are and what you're looking for", paragraph: true, required: true, max: 500 },
    ],
  },
  members: {
    title: "Find members",
    inputs: [
      { id: "skill", label: "Skill (e.g. solidity, design)", required: true, max: 40 },
      { id: "ecosystem", label: "Ecosystem (optional)", required: false, max: 40 },
    ],
  },
  track_add: {
    title: "Add an application",
    inputs: [
      { id: "title", label: "Role or program", required: true, max: 150 },
      { id: "company", label: "Project or company", required: true, max: 100 },
      { id: "deadline", label: "Deadline (YYYY-MM-DD, optional)", required: false, max: 10 },
      { id: "link", label: "Link (optional)", required: false, max: 300 },
      { id: "note", label: "Note (optional)", required: false, max: 500 },
    ],
  },
  profile: {
    title: "Your profile",
    inputs: [
      { id: "skills", label: "Skills (comma-separated)", required: false, max: 300 },
      { id: "roles", label: "Preferred roles (comma-separated)", required: false, max: 300 },
      { id: "ecosystems", label: "Ecosystems (comma-separated)", required: false, max: 300 },
      { id: "portfolio", label: "Portfolio link (https://...)", required: false, max: 300 },
      { id: "github", label: "GitHub link (https://...)", required: false, max: 300 },
    ],
  },
  profile2: {
    title: "Profile details",
    inputs: [
      { id: "level", label: "Level: entry, junior, mid or senior", required: false, max: 10 },
      { id: "arrangement", label: "Work style: remote, hybrid or onsite", required: false, max: 10 },
      { id: "salary", label: "Salary expectation (free text)", required: false, max: 100 },
      { id: "discoverable", label: "Findable by members? yes or no", required: false, max: 3 },
      { id: "cv", label: "CV or short background", paragraph: true, required: false, max: 4000 },
    ],
  },
  a_approve: {
    title: "Approve a listing",
    inputs: [{ id: "ref", label: "Listing number", required: true, max: 9 }],
  },
  a_reject: {
    title: "Reject a listing",
    inputs: [{ id: "ref", label: "Listing number", required: true, max: 9 }],
  },
  a_cooldown: {
    title: "Research cooldown",
    inputs: [{ id: "seconds", label: "Seconds per member (0-3600)", required: true, max: 4 }],
  },
  a_limit: {
    title: "Daily research limit",
    inputs: [{ id: "per_day", label: "Runs per member per day (1-200)", required: true, max: 3 }],
  },
};

export function applyModal(kindLabel: string): ModalSpec {
  return {
    title: kindLabel.slice(0, 45),
    inputs: [
      { id: "target", label: "Project, role or listing number like #12", required: true, max: 200 },
      { id: "details", label: "Job description, CV text or notes", paragraph: true, required: false, max: 4000 },
    ],
  };
}

export function contentModal(formatLabel: string): ModalSpec {
  return { title: formatLabel.slice(0, 45), inputs: [project("Project name or link")] };
}

export function shareModal(typeLabel: string): ModalSpec {
  return {
    title: `Share: ${typeLabel}`.slice(0, 45),
    inputs: [
      { id: "title", label: "Role or program title", required: true, max: 150 },
      { id: "project", label: "Project or company", required: true, max: 100 },
      { id: "link", label: "Official application link", required: true, max: 400 },
      { id: "details", label: "Pay, requirements, deadline (optional)", paragraph: true, required: false, max: 1000 },
    ],
  };
}

export function buildModal(customId: string, spec: ModalSpec): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(spec.title);
  for (const input of spec.inputs) {
    const field = new TextInputBuilder()
      .setCustomId(input.id)
      .setLabel(input.label)
      .setStyle(input.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(input.required ?? false);
    if (input.max) field.setMaxLength(input.max);
    if (input.placeholder) field.setPlaceholder(input.placeholder);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
  }
  return modal;
}
