/**
 * StoryLiner Background Worker
 * 
 * Polls the Postgres job queue and processes due jobs.
 * Run with: npm run worker
 * Run alongside web server: npm run dev:all
 */

import { PrismaClient } from "@prisma/client";
import { handlePublishPost } from "../lib/jobs/handlers/publish-post";
import { shouldFailPublishRetry } from "../lib/jobs/publish-attempt";
import {
  STALE_RUNNING_MS,
  isStaleRunningJob,
  isUnimplementedJobType,
  staleRunningJobError,
  unimplementedJobError,
} from "../lib/jobs/worker-policy";

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 5000;
const WORKER_ID = `worker_${process.pid}`;

async function failStaleRunningJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const stale = await prisma.job.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lte: staleBefore },
    },
    take: 20,
  });

  for (const job of stale) {
    if (!isStaleRunningJob(job.startedAt)) continue;
    const marked = await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: staleRunningJobError(),
        retryCount: job.maxRetries,
      },
    });
    if (marked.count > 0) {
      console.warn(
        `[${WORKER_ID}] Job ${job.id} marked FAILED (stale RUNNING). Not reset to PENDING.`
      );
    }
  }
}

async function processDueJobs(): Promise<void> {
  const now = new Date();

  await failStaleRunningJobs();

  // Claim pending jobs that are due. Retry timing is written to runAt.
  // Do not use prisma.job.fields.maxRetries here — that is DMMF metadata, not a number.
  const jobs = await prisma.job.findMany({
    where: {
      status: "PENDING",
      runAt: { lte: now },
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
      if (isUnimplementedJobType(job.type)) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            errorMessage: unimplementedJobError(job.type),
            retryCount: job.maxRetries,
          },
        });
        console.warn(`[${WORKER_ID}] Job ${job.id} failed: handler not implemented (${job.type})`);
        continue;
      }

      switch (job.type) {
        case "PUBLISH_POST": {
          const outcome = await handlePublishPost(job);
          console.log(`[${WORKER_ID}] Job ${job.id} publish outcome: ${outcome}`);
          break;
        }
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "DONE", completedAt: new Date() },
      });

      console.log(`[${WORKER_ID}] Job ${job.id} completed`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[${WORKER_ID}] Job ${job.id} failed: ${errorMessage}`);

      // Re-read the payload. handlePublishPost claims the write before the
      // adapter call; the in-memory job still has the pre-claim payload.
      const latest = await prisma.job.findUnique({
        where: { id: job.id },
        select: { payload: true },
      });
      const failWithoutRetry = shouldFailPublishRetry({
        payload: latest?.payload ?? job.payload,
        errorMessage,
      });
      const retryCount = failWithoutRetry ? job.maxRetries : job.retryCount + 1;
      const maxRetries = job.maxRetries;
      const shouldRetry = !failWithoutRetry && retryCount < maxRetries;
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
