import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const body = commands.map((c) => c.data.toJSON());

if (config.DISCORD_GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body });
  console.log(`Registered ${body.length} commands in guild ${config.DISCORD_GUILD_ID} (instant).`);
} else {
  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  console.log(`Registered ${body.length} commands globally (can take up to an hour to appear).`);
}
