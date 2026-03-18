/**
 * StoryLiner Background Worker
 * 
 * Polls the Postgres job queue and processes due jobs.
 * Run with: npm run worker
 * Run alongside web server: npm run dev:all
 */

import { PrismaClient } from "@prisma/client";
import { handlePublishPost } from "../lib/jobs/handlers/publish-post";

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 5000;
const WORKER_ID = `worker_${process.pid}`;

async function processDueJobs(): Promise<void> {
  const now = new Date();

  // Claim pending jobs atomically
  const jobs = await prisma.job.findMany({
    where: {
      status: "PENDING",
      runAt: { lte: now },
      retryCount: { lt: prisma.job.fields.maxRetries ? undefined : 3 },
    },
    take: 5,
    orderBy: { runAt: "asc" },
  });

  for (const job of jobs) {
    // Mark as running
    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    if (updated.count === 0) continue; // Another worker claimed it

    console.log(`[${WORKER_ID}] Processing job ${job.id} (type: ${job.type})`);

    try {
      switch (job.type) {
        case "PUBLISH_POST":
          await handlePublishPost(job);
          break;
        case "GENERATE_RECAP":
          console.log(`[${WORKER_ID}] GENERATE_RECAP job ${job.id} - handler not yet implemented`);
          break;
        case "GENERATE_CLIP_FOLLOW_UP":
          console.log(`[${WORKER_ID}] GENERATE_CLIP_FOLLOW_UP job ${job.id} - handler not yet implemented`);
          break;
        case "SEND_LIVESTREAM_REMINDER":
          console.log(`[${WORKER_ID}] SEND_LIVESTREAM_REMINDER job ${job.id} - handler not yet implemented`);
          break;
        default:
          console.warn(`[${WORKER_ID}] Unknown job type: ${job.type}`);
      }

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "DONE", completedAt: new Date() },
      });

      console.log(`[${WORKER_ID}] Job ${job.id} completed`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[${WORKER_ID}] Job ${job.id} failed: ${errorMessage}`);

      const retryCount = job.retryCount + 1;
      const maxRetries = job.maxRetries;
      const shouldRetry = retryCount < maxRetries;
      const nextRetryAt = shouldRetry
        ? new Date(Date.now() + Math.pow(2, retryCount) * 1000 * 30) // exponential backoff
        : undefined;

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          failedAt: shouldRetry ? undefined : new Date(),
          errorMessage,
          retryCount,
          nextRetryAt,
          runAt: nextRetryAt ?? job.runAt,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  console.log(`[${WORKER_ID}] StoryLiner worker starting...`);

  process.on("SIGINT", async () => {
    console.log(`\n[${WORKER_ID}] Shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log(`\n[${WORKER_ID}] SIGTERM received, shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  });

  // Main poll loop
  const poll = async () => {
    try {
      await processDueJobs();
    } catch (err) {
      console.error(`[${WORKER_ID}] Poll error:`, err);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  await poll();
}

main().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
