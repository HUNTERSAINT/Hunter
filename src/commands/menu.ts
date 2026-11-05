import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { memberPanel } from "../buttons/panels.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder().setName("menu").setDescription("Open the button menu: every command as a button"),

  async execute(interaction) {
    await interaction.reply({ ...memberPanel(), flags: MessageFlags.Ephemeral });
  },
};

export default command;
