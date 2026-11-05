import { Worker } from "bullmq";
import type { Client } from "discord.js";
import { prisma } from "../db.js";
import { reportError } from "../monitoring.js";
import { bullConnection } from "../redis.js";
import { clip } from "../utils.js";
import { postDigest } from "./digests.js";
import { runReminders } from "./reminders.js";
import { AUTOMATION_QUEUE } from "./scheduler.js";
import { runScan } from "./scan.js";
import { refreshWatched } from "./watch.js";

export function startAutomationWorker(client: Client) {
  const worker = new Worker<Record<string, unknown>>(
    AUTOMATION_QUEUE,
    async (job) => {
      const run = await prisma.jobRun.create({ data: { name: job.name } });
      try {
        switch (job.name) {
          case "scan-sources":
            await runScan(client);
            break;
          case "watch-refresh":
            await refreshWatched(client);
            break;
          case "digest-daily":
            await postDigest(client, "daily");
            break;
          case "digest-weekly":
            await postDigest(client, "weekly");
            break;
          case "digest-monthly":
            await postDigest(client, "monthly");
            break;
          case "reminders":
            await runReminders(client);
            break;
          default:
            throw new Error(`Unknown automation job: ${job.name}`);
        }
        await prisma.jobRun.update({
          where: { id: run.id },
          data: { status: "ok", finishedAt: new Date() },
        });
      } catch (err) {
        await prisma.jobRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            error: clip(err instanceof Error ? err.message : String(err), 500),
            finishedAt: new Date(),
          },
        });
        throw err;
      }
    },
    { connection: bullConnection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => reportError(err, { automationJob: job?.name }));
  worker.on("error", (err) => reportError(err, { automationWorker: true }));
  return worker;
}
