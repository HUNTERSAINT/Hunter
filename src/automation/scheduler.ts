import { Queue } from "bullmq";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { bullConnection } from "../redis.js";

export const AUTOMATION_QUEUE = "automation";

export type AutomationJobName =
  | "scan-sources"
  | "watch-refresh"
  | "digest-daily"
  | "digest-weekly"
  | "digest-monthly"
  | "reminders";

export const automationQueue = new Queue<Record<string, unknown>>(AUTOMATION_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 200 },
});

/**
 * Registers the repeating jobs. Scans and watch refreshes cost OpenAI credits, so they only run
 * when AUTO_SCAN_ENABLED=true. Digests and reminders only read the database and are always on.
 */
export async function registerSchedules(): Promise<void> {
  const schedules: { name: AutomationJobName; pattern: string; enabled: boolean }[] = [
    { name: "scan-sources", pattern: config.SCAN_CRON, enabled: config.AUTO_SCAN_ENABLED },
    { name: "watch-refresh", pattern: "0 10 * * 3", enabled: config.AUTO_SCAN_ENABLED },
    { name: "digest-daily", pattern: "0 7 * * *", enabled: true },
    { name: "digest-weekly", pattern: "0 8 * * 1", enabled: true },
    { name: "digest-monthly", pattern: "0 9 1 * *", enabled: true },
    { name: "reminders", pattern: "0 * * * *", enabled: true },
  ];

  for (const { name, pattern, enabled } of schedules) {
    const id = `schedule:${name}`;
    if (enabled) {
      await automationQueue.upsertJobScheduler(id, { pattern, tz: "UTC" }, { name, data: {} });
    } else {
      await automationQueue.removeJobScheduler(id).catch(() => undefined);
    }
  }
  logger.info(
    { scans: config.AUTO_SCAN_ENABLED, scanCron: config.SCAN_CRON },
    "automation schedules registered (times are UTC)",
  );
}

/** Runs an automation job right away, e.g. from /admin. */
export async function runAutomationNow(name: AutomationJobName): Promise<void> {
  await automationQueue.add(name, {});
}
