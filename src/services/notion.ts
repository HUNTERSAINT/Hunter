import { config } from "../config.js";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export const notionEnabled = () => !!config.NOTION_TOKEN && !!config.NOTION_DATABASE_ID;

type Prop = { type: string; name: string; select?: { options: { name: string }[] }; status?: { options: { name: string }[] } };

async function notion(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.NOTION_TOKEN}`,
      "notion-version": VERSION,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 404
        ? " Check the database ID and that the database is shared with the integration (… menu, Connections)."
        : res.status === 401
          ? " The Notion token is not valid."
          : "";
    throw new Error(`Notion ${res.status}: ${data.message ?? res.statusText}.${hint}`);
  }
  return data;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const chunk = (s: string) => [{ type: "text", text: { content: s.slice(0, 1900) } }];

/**
 * Adds a row to the tracker database. Fields are matched to the database's own columns by name
 * (ignoring case and punctuation), so it follows whatever columns you have. Columns it can't fill are left blank.
 */
export async function addTrackerRow(fields: Record<string, string>): Promise<{ url: string; skipped: string[] }> {
  const db = await notion(`/databases/${config.NOTION_DATABASE_ID}`);
  const props = Object.entries(db.properties as Record<string, Prop>).map(([name, p]) => ({ ...p, name }));

  const wanted = new Map(Object.entries(fields).map(([k, v]) => [norm(k), v] as const));
  const properties: Record<string, unknown> = {};
  const skipped: string[] = [];
  const used = new Set<string>();

  const title = props.find((p) => p.type === "title");
  if (title) {
    const value = wanted.get(norm("Project")) ?? wanted.get(norm(title.name)) ?? Object.values(fields)[0] ?? "Untitled";
    properties[title.name] = { title: chunk(value) };
    used.add(norm(title.name));
    used.add(norm("Project"));
  }

  for (const p of props) {
    if (p.type === "title") continue;
    const value = wanted.get(norm(p.name));
    if (value === undefined || value === "") continue;
    used.add(norm(p.name));
    switch (p.type) {
      case "rich_text":
        properties[p.name] = { rich_text: chunk(value) };
        break;
      case "select":
        properties[p.name] = { select: { name: value.slice(0, 100) } };
        break;
      case "multi_select":
        properties[p.name] = {
          multi_select: value.split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 10).map((name) => ({ name: name.slice(0, 100) })),
        };
        break;
      case "status": {
        const match = p.status?.options.find((o) => norm(o.name) === norm(value));
        if (match) properties[p.name] = { status: { name: match.name } };
        else skipped.push(`${p.name} (no option "${value}")`);
        break;
      }
      case "date":
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) properties[p.name] = { date: { start: value.slice(0, 10) } };
        break;
      case "url":
        if (/^https?:\/\//.test(value)) properties[p.name] = { url: value };
        break;
      default:
        skipped.push(`${p.name} (${p.type} not supported)`);
    }
  }

  for (const key of Object.keys(fields)) if (!used.has(norm(key))) skipped.push(`${key} (no matching column)`);

  const page = await notion("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: config.NOTION_DATABASE_ID }, properties }),
  });
  return { url: page.url as string, skipped };
}
