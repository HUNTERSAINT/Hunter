import { config } from "./config.js";
import { logger } from "./logger.js";

type SentryModule = typeof import("@sentry/node");
let sentry: SentryModule | null = null;

/** Starts Sentry when SENTRY_DSN is set. Safe to skip. */
export async function initMonitoring(): Promise<void> {
  if (!config.SENTRY_DSN) return;
  try {
    sentry = await import("@sentry/node");
    sentry.init({ dsn: config.SENTRY_DSN, tracesSampleRate: 0 });
    logger.info("Sentry enabled");
  } catch (err) {
    logger.warn({ err }, "Sentry could not be loaded, continuing without it");
  }
}

/** Logs an error and forwards it to Sentry when enabled. */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  logger.error({ err, ...context }, "error");
  sentry?.captureException(err, { extra: context });
}
