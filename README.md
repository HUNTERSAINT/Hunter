# Web3 Job Hunters AI

A Discord bot for Web3 job hunters: research a project, find jobs, ambassador programs, bounties and grants, prepare applications, track the outcome, and stay safe from scams. All inside Discord.

```
Discover -> Research -> Identify opportunities -> Apply -> Contribute -> Earn
```

## What is built

| Area | Commands and features |
| --- | --- |
| **Research** | `/research` full AI research with web search, split into **verified**, **project claims** and **not found**. `/compare` two projects for different contributor types. `/projects search` and `/projects history` for saved research and what changed. |
| **Opportunities** | `/opportunities`, `/jobs` (16 role categories, remote, entry-level and no-degree filters), `/ambassadors`, `/bounties` (cash, token, points, grant, unpaid). `/match` ranks listings against your profile. `/saved`, `/digest`, `/share`. |
| **Career tools** | `/profile` (skills, level, roles, ecosystems, links, CV). `/apply` drafts cover letters, ambassador answers, outreach, pitches, cold DMs, contributor applications, CV review and interview prep. `/content` creates X threads, articles, LinkedIn posts, UGC scripts and more from saved research. `/track` is a private application tracker with statuses, deadlines, notes, links, history and follow-up reminders. |
| **Alerts and automation** | Scheduled web scans, duplicate detection, announcement posts per channel, DMs to people watching a project, closing-soon notices, deadline and follow-up reminders, daily, weekly and monthly digests, weekly member spotlight. |
| **Watchlist** | `/watch` and `/unwatch`. Watchers get a DM when a listing from that project is announced or reopens. With scans on, the most-watched projects are re-researched weekly and watchers hear about new verified funding or partnerships and new red flags. |
| **Safety** | `/scamcheck` and automatic checks on every discovered or shared listing: upfront fees, seed phrase requests, send-crypto-first, unrealistic earnings, lookalike domains, shortened links and more. It reports evidence and confidence, never treats missing information as a warning sign, and says a clean result is not proof of legitimacy. Listings with warning signs wait for admin review. |
| **Community** | `/introduce`, `/members` (only people who opt in), `/leaderboard`, points for fresh research, introductions and approved shares, admin awards, role rewards. |
| **Admin** | `/admin config` (channels, research on/off, cooldown, daily limit, role rewards), `sources`, `opportunities` (approve or reject), `users`, `reports run`, `analytics` (usage, queues, failures, estimated AI cost), `pause`, `resume`. Admin-only. |
| **Production** | Redis queues with retries, quotas and cooldowns, health endpoint, optional Sentry, CI workflow, tests, and an ingest API for n8n. |

## How it works

```
Discord command -> checks + quota -> request saved in Postgres -> BullMQ queue
                                                                      |
Discord channel <- embeds <- worker: saved research, or OpenAI Responses API + web search

Scheduler (BullMQ) -> scans, digests, reminders, watch refresh -> channels and DMs
n8n or any tool    -> POST /api/ingest ------------------------> same duplicate and scam checks
```

Discord never waits for long tasks: commands reply immediately and results are posted when ready. Failed jobs retry, then the member is told and their quota is refunded.

**Listing approval rules.** A discovered listing is approved automatically only if it has a real application link on an official source **and** no scam warning signs. Everything else, including every `/share`, waits for `/admin opportunities approve`.

## Setup

1. **Create the Discord app** at https://discord.com/developers/applications. Add a bot, copy the token and the application ID. No privileged intents are needed. Invite it with scopes `bot` and `applications.commands`, and permissions View Channels, Send Messages, Embed Links, plus Manage Roles if you want reward roles.
2. **Install** (Node 22 or newer):
   ```bash
   npm install
   cp .env.example .env     # then fill it in
   ```
3. **Create the database tables.** `npm start` does this automatically (`prisma db push`). Locally you can run `npx prisma db push`.
4. **Register the slash commands** (set `DISCORD_GUILD_ID` for instant updates while developing):
   ```bash
   npm run deploy:commands
   ```
5. **Run it:** `npm run dev`
6. **Set up your server.** As an administrator run `/admin setup`. It creates the categories and channels (named like `🎙️ » job-talk-voice-room`), sets their permissions, connects every feed and posts the button menu. The bot needs Manage Channels. Or map feeds by hand with `/admin config channel` for each: `jobs`, `bounties`, `ambassadors`, `research`, `analysis`, `ecosystem`, `digests`, `networking`. Nothing is posted to a feed until its channel is set.

Suggested channels, from the plan: announcements, server-rules, job-alerts, bounties-and-gigs, ambassador-programs, project-research, project-analysis, ecosystem-updates, applications-and-submissions, resources-and-learning, networking, general-chat and the two voice rooms. Create them yourself, then map the feeds above.

## Deploy on Railway

1. Push this repo to GitHub and create a Railway project from it.
2. Add the **PostgreSQL** and **Redis** plugins and reference their URLs as `DATABASE_URL` and `REDIS_URL`.
3. Add the other variables from `.env.example`.
4. Build command `npm run build`, start command `npm start` (creates or updates the tables, then starts everything). Health check path `/health`.
5. Run `npm run deploy:commands` once from your machine.

One service runs the bot, both workers and the API. Split the workers into their own service when traffic grows.

## Buttons

Every command is also a button. Members type `/menu` (private) and tap through research, jobs, ambassadors, bounties, profile, drafts, tracker, scam check and more; anything that needs typing opens a small form. Admins run `/admin panel` to post the menu in a channel for everyone, and `/admin controls` for the admin buttons (analytics, settings, pending listings, approve/reject, channels, cooldown, limits, pause, scans, reports).

## Costs and limits

Web research and scans use OpenAI credits on every run. Controls:

- `RESEARCH_COOLDOWN_SECONDS`, `RESEARCH_DAILY_LIMIT_PER_USER` (a comparison counts as two), `RESEARCH_CACHE_DAYS`. Admins can override the first two per server with `/admin config`.
- `ASSIST_DAILY_LIMIT` for `/apply` and `/content`, which are single AI calls without web search.
- `AUTO_SCAN_ENABLED=false` by default. Turn it on only when you are ready for twice-daily scans (`SCAN_CRON`) and weekly watch refreshes. Digests, reminders and alerts never call OpenAI.
- `/admin analytics` shows an estimated cost from the prices in `.env`. It is an estimate, not your bill.

## n8n and the ingest API

Set `INGEST_API_KEY`, then have an n8n HTTP Request node `POST https://<your-app>/api/ingest` with header `x-api-key: <key>` and a JSON body of the form `{ "opportunities": [ { "type": "JOB", "title": "...", "projectName": "...", "applyUrl": "https://...", "officialSource": true } ] }`. Up to 50 per call. Fields match the listing schema in `src/ai/opportunitySchema.ts`. Listings go through the same duplicate and scam checks as everything else.

## Things to know

- **This was written without being installed or run.** I checked the pure logic (scam rules, matching, text splitting, dates, duplicate keys) by running it, but the Discord, database, Redis and OpenAI code has never executed. Expect to fix a few small errors on the first `npm run typecheck` and first run.
- **The web search tool name** is `web_search_preview` in `src/ai/research.ts` and `src/ai/opportunities.ts`. If your OpenAI SDK expects `web_search`, change it in both.
- **AI output can be wrong.** Research and listings are AI-assisted. Embeds say so, sources come from the search tool's citations, and unverified listings are labelled.
- **Watch matching is by name.** `/watch Uniswap` matches listings whose project name normalises to the same text, so "Uniswap Labs" would not match "Uniswap".
- **Member data.** Profiles, CV text and application notes are stored in your database. Only the member sees them, except skills and level for members who turn on `discoverable`. Tell your members, and delete data on request.
- **Not included:** a web dashboard (admin is done through `/admin`), the guild-scoped quotas beyond cooldown and daily limit, and voice-room features.

## Project layout

```
prisma/schema.prisma           All tables
src/index.ts                   Entry: Discord client, both workers, schedules, API
src/commands/                  Slash commands
src/workers/                   Research, comparison and discovery worker
src/automation/                Scheduler, scans, announcements, digests, reminders, watch refresh
src/ai/                        OpenAI calls, schemas, usage tracking
src/security/scam.ts           Scam pattern detection
src/services/                  Opportunities, projects, matching, points, guild settings
src/server.ts                  /health and /api/ingest
```
