import { Redis } from "ioredis";
import { config } from "./config.js";

// family: 0 lets ioredis resolve both IPv4 and IPv6, which Railway's private network needs.
export const redis = new Redis(config.REDIS_URL, { family: 0 });

/**
 * Connection options for BullMQ, built from REDIS_URL.
 * BullMQ requires maxRetriesPerRequest to be null on its connections.
 */
function buildBullConnection() {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    family: 0,
    maxRetriesPerRequest: null as null,
  };
}

export const bullConnection = buildBullConnection();
