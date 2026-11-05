import { getGuildSettings } from "./services/guild.js";

/** Commands that keep working while an admin has paused the bot. */
const ALWAYS_ON = new Set(["help", "health", "admin", "menu"]);
/** Commands that are switched off by /admin config research. */
const NEEDS_RESEARCH = new Set(["research", "compare"]);

/**
 * Returns the reason a command is blocked on this server (paused, or research turned off),
 * or null when it may run. Used for slash commands and for buttons alike.
 */
export async function gateMessage(commandName: string, guildId: string | null): Promise<string | null> {
  if (!guildId) return null;
  const settings = await getGuildSettings(guildId);
  if (settings.paused && !ALWAYS_ON.has(commandName)) {
    return "The bot is paused on this server by an admin.";
  }
  if (!settings.autoResearch && NEEDS_RESEARCH.has(commandName)) {
    return "Research is turned off on this server by an admin.";
  }
  return null;
}
