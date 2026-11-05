import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

function button(id: string, label: string, emoji: string, style: ButtonStyle = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
}

export function row(...buttons: ButtonBuilder[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

/** The member menu: every member command as a button. Buttons that need typing open a small form. */
export function memberPanel() {
  const P = ButtonStyle.Primary;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("💼 Web3 Job Hunters AI")
    .setDescription(
      "Discover a project, research it, find opportunities, apply and track the outcome. Tap a button. Only you see the answers.",
    )
    .addFields(
      { name: "Research", value: "Research, compare, search saved research, watch projects", inline: true },
      { name: "Opportunities", value: "Jobs, ambassador programs, bounties, search, your matches", inline: true },
      { name: "Career", value: "Profile, AI drafts, content ideas, application tracker", inline: true },
      { name: "More", value: "Saved listings, digests, trending, scam check, share, introduce, find members, leaderboard", inline: true },
    )
    .setFooter({ text: "AI-assisted and can be wrong. Never pay to apply or share a seed phrase." });

  return {
    embeds: [embed],
    components: [
      row(
        button("hj:research", "Research", "🔬", P),
        button("hj:compare", "Compare", "⚖️"),
        button("hj:projects", "Saved research", "🗂️"),
        button("hj:watch", "Watch", "👀"),
        button("hj:watchlist", "My watchlist", "📌"),
      ),
      row(
        button("hj:jobs", "Jobs", "💼", P),
        button("hj:ambassadors", "Ambassadors", "🏆", P),
        button("hj:bounties", "Bounties", "🎯", P),
        button("hj:search", "Search", "🔎"),
        button("hj:match", "My matches", "✨"),
      ),
      row(
        button("hj:profile_view", "My profile", "🪪"),
        button("hj:profile_edit", "Edit profile", "✏️"),
        button("hj:apply", "Apply drafts", "📝", P),
        button("hj:content", "Content ideas", "💡"),
        button("hj:track_list", "My applications", "📋"),
      ),
      row(
        button("hj:track_add", "Add application", "➕"),
        button("hj:saved", "Saved", "🔖"),
        button("hj:digest_daily", "Today", "🗞️"),
        button("hj:digest_weekly", "This week", "📅"),
        button("hj:trending", "Trending", "🔥"),
      ),
      row(
        button("hj:scam", "Scam check", "🛡️"),
        button("hj:share", "Share a listing", "📣"),
        button("hj:introduce", "Introduce me", "👋"),
        button("hj:members", "Find members", "🤝"),
        button("hj:leaderboard", "Leaderboard", "🏅"),
      ),
    ],
  };
}

/** The admin controls as buttons. Shown only to the admin who opens them. */
export function adminPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("⚙️ Admin controls")
    .setDescription("Everything in `/admin`, as buttons. Only server administrators can use these.");

  return {
    embeds: [embed],
    components: [
      row(
        button("hja:analytics", "Analytics", "📊", ButtonStyle.Primary),
        button("hja:config_view", "Settings", "🔧"),
        button("hja:pending", "Pending listings", "⏳"),
        button("hja:sources", "Sources", "🌐"),
        button("hja:scan", "Scan now", "🔄"),
      ),
      row(
        button("hja:approve", "Approve", "✅", ButtonStyle.Success),
        button("hja:reject", "Reject", "❌", ButtonStyle.Danger),
        button("hja:channel", "Set a channel", "#️⃣"),
        button("hja:cooldown", "Cooldown", "⏱️"),
        button("hja:limit", "Daily limit", "🔢"),
      ),
      row(
        button("hja:research_on", "Research on", "🟢"),
        button("hja:research_off", "Research off", "⚪"),
        button("hja:pause", "Pause bot", "⏸️", ButtonStyle.Danger),
        button("hja:resume", "Resume bot", "▶️", ButtonStyle.Success),
        button("hja:setup", "Set up server", "🏗️", ButtonStyle.Primary),
      ),
      row(
        button("hja:report_daily", "Daily report", "🗞️"),
        button("hja:report_weekly", "Weekly report", "📅"),
        button("hja:report_monthly", "Monthly report", "📆"),
        button("hja:studio", "Creator studio", "✍️", ButtonStyle.Primary),
      ),
    ],
  };
}

/** A single follow-up button, used after saving the first part of a profile. */
export function profileMoreRow() {
  return row(button("hj:profile2", "Add more details", "➕"));
}

/** Creator tools for administrators. Each button opens a small form. */
export function studioPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("✍️ Creator studio")
    .setDescription(
      "**Reply pack:** best reply, quote idea and more for any tweet.\n**KOL package:** research, verdict, article, thread, covers, playbook, application answers and a Notion row.\n**Content batch:** a scheduled pack of trading and Web3 posts with 10 replies each.",
    );
  return {
    embeds: [embed],
    components: [
      row(
        button("hj:c_reply", "Reply pack", "💬", ButtonStyle.Primary),
        button("hj:c_kol", "KOL package", "🕵️", ButtonStyle.Primary),
        button("hj:c_batch", "Content batch", "📅", ButtonStyle.Primary),
      ),
    ],
  };
}
