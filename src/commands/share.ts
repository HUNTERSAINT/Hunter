import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { ingestOpportunities } from "../services/opportunities.js";
import { upsertMember } from "../services/members.js";
import { isHttpUrl } from "../utils.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("share")
    .setDescription("Share an opportunity you found. An admin reviews it before it goes live")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Kind of opportunity")
        .setRequired(true)
        .addChoices(
          { name: "Job", value: "JOB" },
          { name: "Ambassador or contributor program", value: "AMBASSADOR" },
          { name: "Bounty or gig", value: "BOUNTY" },
          { name: "Grant", value: "GRANT" },
        ),
    )
    .addStringOption((o) => o.setName("title").setDescription("Role or program title").setRequired(true).setMaxLength(150))
    .addStringOption((o) => o.setName("project").setDescription("Project or company name").setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName("link").setDescription("Official application or program link").setRequired(true))
    .addStringOption((o) => o.setName("details").setDescription("Pay, requirements, deadline, anything useful").setMaxLength(1000)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const link = interaction.options.getString("link", true).trim();
    if (!isHttpUrl(link)) {
      await interaction.editReply("The link must start with http:// or https://.");
      return;
    }

    const member = await upsertMember(interaction.user.id, interaction.user.username);
    const result = await ingestOpportunities(
      [
        {
          type: interaction.options.getString("type", true) as "JOB" | "AMBASSADOR" | "BOUNTY" | "GRANT",
          title: interaction.options.getString("title", true).trim(),
          projectName: interaction.options.getString("project", true).trim(),
          description: interaction.options.getString("details")?.trim() ?? "",
          rewardType: "UNKNOWN",
          entryLevel: false,
          noDegree: false,
          isOpen: true,
          officialSource: false,
          applyUrl: link,
        },
      ],
      { submittedById: member.id, forcePending: true },
    );

    if (result.created.length === 0) {
      await interaction.editReply("That listing is already in the database, so it was not added twice. Thanks for checking.");
      return;
    }

    const flagged = result.created[0].scamRisk !== "none";
    await interaction.editReply(
      `Thanks! Your listing is waiting for an admin to review it. You'll earn community points when it's approved.` +
        (flagged ? " I noticed a few warning signs in it, so a moderator will take a closer look." : ""),
    );
  },
};

export default command;
