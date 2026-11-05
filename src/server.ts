import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { opportunityInputSchema } from "./ai/opportunitySchema.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { reportError } from "./monitoring.js";
import { redis } from "./redis.js";
import { ingestOpportunities } from "./services/opportunities.js";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const ingestBody = z.object({ opportunities: z.array(opportunityInputSchema).min(1).max(50) });

/**
 * Small HTTP server: a health check for Railway, and an optional ingest endpoint so n8n (or any
 * other tool) can push opportunities in. The ingest endpoint is off unless INGEST_API_KEY is set.
 */
export function createServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async (_req, reply) => {
    const checks = { database: false, redis: false };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      // reported below
    }
    try {
      await redis.ping();
      checks.redis = true;
    } catch {
      // reported below
    }
    const ok = checks.database && checks.redis;
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", uptime: process.uptime(), ...checks });
  });

  app.post("/api/ingest", async (req, reply) => {
    if (!config.INGEST_API_KEY) return reply.code(404).send({ error: "Not enabled" });

    const key = String(req.headers["x-api-key"] ?? "");
    if (!safeEqual(key, config.INGEST_API_KEY)) return reply.code(401).send({ error: "Invalid API key" });

    const body = ingestBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid body", details: body.error.flatten() });

    try {
      const result = await ingestOpportunities(body.data.opportunities);
      return {
        created: result.created.length,
        updated: result.updated,
        skipped: result.skipped,
        pendingReview: result.pending,
      };
    } catch (err) {
      reportError(err, { route: "ingest" });
      return reply.code(500).send({ error: "Could not store the listings" });
    }
  });

  return {
    start: () => app.listen({ port: config.PORT, host: "0.0.0.0" }),
    close: () => app.close(),
  };
}
