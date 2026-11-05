import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { studioPanel } from "../buttons/panels.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder().setName("studio").setDescription("Creator studio buttons: replies, KOL package, content batch (admins)"),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "The creator tools are for server administrators.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...studioPanel(), flags: MessageFlags.Ephemeral });
  },
};

export default command;
