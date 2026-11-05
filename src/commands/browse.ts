import type { ChatInputCommandInteraction } from "discord.js";
import { opportunityListEmbed } from "../opportunityEmbeds.js";
import { searchOpportunities, type OppFilters } from "../services/opportunities.js";

/** Runs a listing search and replies with the results. The interaction must already be deferred. */
export async function runBrowse(
  interaction: ChatInputCommandInteraction,
  filters: OppFilters,
  title: string,
  note?: string,
): Promise<void> {
  const list = await searchOpportunities(filters);
  if (list.length === 0) {
    const empty =
      "No matching open listings are saved yet. Try broader keywords, or use `/opportunities refresh:true` to ask me to search the web.";
    await interaction.editReply(note ? `${note}\n\n${empty}` : empty);
    return;
  }
  await interaction.editReply({
    content: note,
    embeds: [opportunityListEmbed(title, list)],
  });
}
