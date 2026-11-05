import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../db.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { upsertMember } from "../services/members.js";
import type { Command } from "./types.js";

const MAX_SAVED = 100;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("saved")
    .setDescription("Your saved opportunities")
    .addSubcommand((s) => s.setName("list").setDescription("View your saved opportunities"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Save a listing")
        .addIntegerOption((o) => o.setName("ref").setDescription("Listing number").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a saved listing")
        .addIntegerOption((o) => o.setName("ref").setDescription("Listing number").setRequired(true).setMinValue(1)),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await upsertMember(interaction.user.id, interaction.user.username);
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const saved = await prisma.savedOpportunity.findMany({
        where: { memberId: member.id },
        include: { opportunity: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      await interaction.editReply({
        embeds: [
          opportunityListEmbed(
            "Your saved opportunities",
            saved.map((s) => s.opportunity),
            undefined,
            "You haven't saved anything yet. Use `/saved add ref:<number>` on a listing.",
          ),
        ],
      });
      return;
    }

    const ref = interaction.options.getInteger("ref", true);
    const opportunity = await prisma.opportunity.findFirst({ where: { ref, status: "APPROVED" } });
    if (!opportunity) {
      await interaction.editReply(`I couldn't find listing #${ref}.`);
      return;
    }

    if (sub === "add") {
      const count = await prisma.savedOpportunity.count({ where: { memberId: member.id } });
      if (count >= MAX_SAVED) {
        await interaction.editReply(`You can save up to ${MAX_SAVED} listings. Remove some first.`);
        return;
      }
      await prisma.savedOpportunity.upsert({
        where: { memberId_opportunityId: { memberId: member.id, opportunityId: opportunity.id } },
        create: { memberId: member.id, opportunityId: opportunity.id },
        update: {},
      });
      await interaction.editReply(
        `Saved **${opportunity.title}** (#${ref}). I'll message you if it's closing soon. Track an application with \`/track add listing:${ref}\`.`,
      );
      return;
    }

    await prisma.savedOpportunity.deleteMany({ where: { memberId: member.id, opportunityId: opportunity.id } });
    await interaction.editReply(`Removed #${ref} from your saved listings.`);
  },
};

export default command;
