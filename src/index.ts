import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { automationQueue, registerSchedules } from "./automation/scheduler.js";
import { startAutomationWorker } from "./automation/worker.js";
import { handleComponent } from "./buttons/handler.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { gateMessage } from "./gate.js";
import { logger } from "./logger.js";
import { initMonitoring, reportError } from "./monitoring.js";
import { researchQueue } from "./queue.js";
import { redis } from "./redis.js";
import { createServer } from "./server.js";
import { setPointsClient } from "./services/points.js";
import { startResearchWorker } from "./workers/researchWorker.js";

await initMonitoring();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, (c) => {
  logger.info(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Buttons, forms and menus from the bot's panels.
  if (!interaction.isChatInputCommand()) {
    await handleComponent(interaction);
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    const blocked = await gateMessage(interaction.commandName, interaction.guildId);
    if (blocked) {
      await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
      return;
    }
    await command.execute(interaction);
  } catch (err) {
    reportError(err, { command: interaction.commandName });
    const message = "Something went wrong running that command. Please try again.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message);
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // the interaction may have expired; nothing more to do
    }
  }
});

setPointsClient(client);
const researchWorker = startResearchWorker(client);
const automationWorker = startAutomationWorker(client);
await registerSchedules();
const server = createServer();

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  await researchWorker.close().catch(() => undefined);
  await automationWorker.close().catch(() => undefined);
  await server.close().catch(() => undefined);
  await researchQueue.close().catch(() => undefined);
  await automationQueue.close().catch(() => undefined);
  await client.destroy();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => reportError(err, { unhandledRejection: true }));

await server.start();
logger.info(`Health server listening on port ${config.PORT}`);
await client.login(config.DISCORD_TOKEN);
