import { Queue } from "bullmq";
import { bullConnection } from "./redis.js";

export const RESEARCH_QUEUE = "research";

/** The job only carries the request id; everything else is read from the database. */
export type ResearchJobData = { requestId: string };

export const researchQueue = new Queue<ResearchJobData>(RESEARCH_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
