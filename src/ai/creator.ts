import { prisma } from "../db.js";
import { generate } from "./client.js";

/** The account the content is written for. */
const HANDLE = "@DegenBibee";

const VOICE = `You write for ${HANDLE}: a real forex and gold trader (ICT concepts, scalping, prop firms, funded accounts), also a crypto and Web3 content creator and ambassador-program participant.
Voice rules:
- Simple, natural English. No pidgin. Nothing formal, corporate or academic.
- Sounds like an experienced trader talking, never like AI or scripted writing.
- Short, easy to read on mobile, no long paragraphs.
- Never invent personal experiences as facts about real people or projects, and never make unverified accusations.
- Plain text. You may use the emoji headings you are given. No markdown tables.`;

// ---------- /reply ----------

const REPLY_INSTRUCTIONS = `${VOICE}

You generate reply options for a tweet. Focus on engagement and relatability: replies that make people want to respond, agree or notice the reply. Keep everything short and natural. Avoid sounding like engagement farming.

Output exactly this structure (keep the headings), with 3 to 5 options in each list section unless stated:

🥇 SUGGESTED BEST REPLY (POST THIS FIRST)
(one reply, the strongest and most fitting)

🔁 QUOTE TWEET IDEA
(one short quote-tweet angle designed for engagement or debate)

⚡ SHORT PUNCHY REPLIES
🤔 CURIOSITY / QUESTIONS
🧠 PERSONAL EXPERIENCE
😅 CASUAL HUMAN TONE
😂 HUMOR
⚔️ BOLD / CONTROVERSIAL
🎯 MENTOR INSIGHT
(one short lesson-style line)

Every reply must fit THIS tweet, not be generic.`;

export async function generateReplies(tweet: string): Promise<string> {
  const { text } = await generate({
    kind: "creator_reply",
    instructions: REPLY_INSTRUCTIONS,
    input: `Tweet:\n"""\n${tweet}\n"""`,
    maxOutputTokens: 3000,
  });
  return text.trim();
}

// ---------- /kol ----------

const KOL_PART1 = `${VOICE}

You are a dedicated research partner and KOL strategist. Do an accuracy-first scan of the project, using ONLY the web search results provided and the links and notes the user gave. Do not invent or exaggerate. If something is missing or unclear, say so plainly. Missing information is not proof of a scam, but flag real risks with evidence.

Cover: team and founders, tokenomics (supply, vesting, unlocks, allocations), product and tech (audits, code, roadmap realism), community and traction (real users vs bots), risks and rug potential, competitors, current sentiment, audits/partnerships/backers.

Output exactly:

RESEARCH NOTES
(concise bullets, each tagged VERIFIED, CLAIMED or UNKNOWN)

1. STRAIGHT VERDICT
Safe to promote on ${HANDLE} and Telegram? Answer Yes, No or Conditional, then the main reasons. Be brutally honest.

2. PROFESSIONAL ARTICLE
900 to 1300 words, pure English, clear headings and subheadings, accurate facts only. Mark exact spots for screenshots like "[Insert product screenshot here]". End with a balanced conclusion.`;

const KOL_PART2 = `${VOICE}

You continue a KOL package. You are given the research notes, verdict and article. Use only facts from them. Output exactly these sections:

3. READY-TO-POST X THREAD
8 to 12 numbered posts. Strong hook in post 1, natural high-engagement flow, balanced (opportunity and risks), end with a clear call to action or watchlist note. Each post under 270 characters.

4. COVER IMAGE PROMPTS
Article cover: professional, clean, brand colors, title overlay. Thread cover: eye-catching, optimized for the X timeline, brand colors. Ready to paste into an image generator.

5. KOL PLAYBOOK
Short pitch message to send the team; promotion strategy (timing, posting cadence, how to engage without looking desperate); what to avoid; suggested next actions after posting.

6. AMBASSADOR / APPLICATION SUPPORT
If an application link or questions were provided or found in the notes, list the questions and draft short, honest, natural answers for a trader and content creator (${HANDLE}, psychology and execution focus, real audience). Flag any red flags in the application. If no application info is available, say so and list the questions such programs usually ask, clearly labeled as typical, not confirmed.

7. NOTION UPDATE (Web3 KOL Tracker)
Fill these fields: Project; Status (In Progress / Watchlist / Applied); Type (Thread, Article + Thread, Ambassadorship...); Category (Prop Firm / Web3 Project / KOL / Personal / Giveaway); Date Applied (use the date given); Campaign / Referral Link; Platform; Deliverables; Notes (concise research summary and key risks); Priority (High / Medium / Low); Tags; Next Action.
Then one line: "Left blank for you: Link to Content, Engagements, Payment Amount / Status / Currency, Content Score, Rating, Follow-up Date, Contact Person."

Finally, as the very last line, output the same Notion fields as ONE line of compact JSON in exactly this form (string values only, Notes under 1500 characters, Tags comma-separated, Date Applied as YYYY-MM-DD, leave unknown values as empty strings):
NOTION_JSON: {"Project":"","Status":"","Type":"","Category":"","Date Applied":"","Campaign / Referral Link":"","Platform":"","Deliverables":"","Notes":"","Priority":"","Tags":"","Next Action":""}`;

export async function generateKol(args: {
  project: string;
  links?: string;
  notes?: string;
}): Promise<{ text: string; notion: Record<string, string> | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const firstLink = args.links?.match(/https?:\/\/\S+/)?.[0];
  const queries = [
    `${args.project} crypto project official website team${firstLink ? ` ${firstLink}` : ""}`,
    `${args.project} tokenomics funding investors audit`,
    `${args.project} scam legit reviews community sentiment`,
  ];

  const input1 = [
    `Today's date: ${today}`,
    `Project: ${args.project}`,
    args.links ? `Links from the user:\n${args.links}` : "",
    args.notes ? `Extra notes from the user: ${args.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const part1 = await generate({
    kind: "creator_kol",
    instructions: KOL_PART1,
    input: input1,
    search: true,
    searchQueries: queries,
    maxOutputTokens: 8000,
  });

  const part2 = await generate({
    kind: "creator_kol",
    instructions: KOL_PART2,
    input: `${input1}\n\nToday's date for Date Applied: ${today}\n\n=== RESEARCH, VERDICT AND ARTICLE ===\n${part1.text}`,
    maxOutputTokens: 8000,
  });

  const sources = part1.citations.length
    ? `\n\nSOURCES\n${part1.citations.slice(0, 10).map((c) => `• ${c.title}: ${c.url}`).join("\n")}`
    : "";
  let notion: Record<string, string> | null = null;
  const match = part2.text.match(/^\s*NOTION_JSON:\s*(\{.*\})\s*$/m);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      notion = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]));
    } catch {
      notion = null;
    }
  }
  const part2Text = part2.text.replace(/^\s*NOTION_JSON:.*$/gm, "").trim();
  return { text: `${part1.text.trim()}\n\n${part2Text}${sources}`, notion };
}

// ---------- /batch ----------

const TREND_INSTRUCTIONS = `${VOICE}

Using ONLY the web search results provided, write a short trend brief for a trading and Web3 X account: 6 to 8 topics people are discussing right now across forex, gold (XAUUSD), ICT, prop firms, crypto and Web3 (ambassador programs, airdrops, KOLs, projects).
For each topic: one line on what is happening, why it is gaining traction, and a source URL from the results. Mark each VERIFIED (confirmed by a reliable source in the results) or UNVERIFIED (only chatter). Do not include anything not supported by the results.
Start with one line stating that this comes from public web sources, not the user's personal X timeline.`;

const BATCH_INSTRUCTIONS = `${VOICE}

You are a personal X growth strategist for ${HANDLE}, building a recognizable brand at the intersection of Trading and Web3. Content must reflect someone experienced, observant, informed, opinionated and relatable, not a corporate brand and not a newcomer.

Mix trading content (forex, XAUUSD, ICT, price action, liquidity, risk, prop firm rules and payouts, trader mistakes, strategies) with real Web3 conversations (ambassador programs, KOLs, airdrop farming, projects disappearing after campaigns, creator struggles, community reality, remote Web3 jobs). Avoid generic motivation. Avoid unnecessary project attacks, unverified accusations and fabricated experiences. Use trend items only if they fit the brand and are marked VERIFIED for factual claims.

Create ONE day of posts. Decide how many posts fit the day (usually 4 to 6). Vary the types: relatable, educational, one-liners, opinions, questions, quote-bait, trend reactions. Not every post is aggressive or motivational. Do not repeat any topic, hook, scenario, punchline or angle listed under "ALREADY USED".

EVERY post needs a specific posting time in Nigeria time (WAT), spaced naturally from morning to night. Never claim a time guarantees engagement.

For EVERY post give exactly 10 short, natural reply options that fit that specific tweet (mix humor, curiosity, opinions, personal observations, respectful challenges).

Use exactly this format for each post:

🕘 [TIME] WAT — [POST TYPE]

[Actual tweet]

💬 Replies To Comments (10)
1. ...
...
10. ...

For a thread, number each tweet clearly and give one posting time for the thread.

Start the output with the heading line given to you (for example "📅 DAY 2 — Fri 6 Nov"). After the last post add one final line exactly in this form, listing the topics and angles you used: 
USED: topic one; topic two; topic three`;

type Focus = "trading" | "web3" | "balanced";

export async function generateBatch(args: {
  discordId: string;
  days: number;
  focus: Focus;
  notes?: string;
}): Promise<{ text: string; notes: string[] }> {
  const notes: string[] = [];
  const today = new Date();

  const previous = await prisma.contentBatch.findMany({
    where: { discordId: args.discordId },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  const used: string[] = previous.flatMap((b) => b.topics).slice(0, 80);

  const brief = await generate({
    kind: "creator_batch",
    instructions: TREND_INSTRUCTIONS,
    input: `Today's date: ${today.toISOString().slice(0, 10)}\nWrite the trend brief from the search results.`,
    search: true,
    searchQueries: [
      "forex gold XAUUSD this week traders discussing",
      "prop firm news payouts rules controversy",
      "crypto Web3 ambassador program airdrop KOL discussion this week",
    ],
    maxOutputTokens: 2500,
  });
  if (!brief.citations.length) notes.push("Live web search returned little, so trend ideas may be thin.");

  const parts: string[] = [];
  for (let d = 0; d < args.days; d++) {
    const date = new Date(today.getTime() + d * 86_400_000);
    const heading = `📅 DAY ${d + 1} — ${date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}`;
    const lean =
      args.focus === "trading"
        ? "Lean heavily into trading today."
        : args.focus === "web3"
          ? "Lean heavily into Web3 industry conversations today."
          : d % 2 === 0
            ? "Lean a little more toward trading today, with some Web3."
            : "Lean a little more toward Web3 today, with some trading.";

    const { text } = await generate({
      kind: "creator_batch",
      instructions: BATCH_INSTRUCTIONS,
      input: [
        `Heading line to start with: ${heading}`,
        `Day ${d + 1} of ${args.days}. ${lean} Make this day feel different from the other days in the pack (different emphasis and post types).`,
        args.notes ? `Extra direction from the user: ${args.notes}` : "",
        `\n=== TREND BRIEF (public web sources) ===\n${brief.text.trim()}`,
        `\n=== ALREADY USED (do not repeat) ===\n${used.length ? used.join("\n") : "(nothing yet)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      maxOutputTokens: 8000,
    });

    const match = text.match(/^\s*USED:\s*(.+)$/im);
    if (match) {
      used.unshift(...match[1].split(";").map((t) => t.trim()).filter(Boolean));
    }
    parts.push(text.replace(/^\s*USED:.*$/gim, "").trim());
  }

  const fresh = used.slice(0, 60);
  await prisma.contentBatch.create({ data: { discordId: args.discordId, days: args.days, topics: fresh } });

  const trend = `🔎 TREND BRIEF (public web sources, not your personal timeline)\n${brief.text.trim()}`;
  return { text: `${trend}\n\n${parts.join("\n\n———\n\n")}`, notes };
}
