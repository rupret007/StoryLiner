import type { JobType } from "@prisma/client";

/**
 * Job types the worker must fail closed on. Never mark these DONE.
 * They are not a live-publish path.
 */
export const UNIMPLEMENTED_JOB_TYPES: readonly JobType[] = [
  "GENERATE_RECAP",
  "GENERATE_CLIP_FOLLOW_UP",
  "SEND_LIVESTREAM_REMINDER",
];

export function isUnimplementedJobType(type: string): boolean {
  return (UNIMPLEMENTED_JOB_TYPES as readonly string[]).includes(type);
}

export function unimplementedJobError(type: string): string {
  return `Handler not implemented for ${type}`;
}

/** RUNNING longer than this is treated as dead — never reset to PENDING. */
export const STALE_RUNNING_MS = 10 * 60 * 1000;

export function isStaleRunningJob(
  startedAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!startedAt) return false;
  return now.getTime() - startedAt.getTime() >= STALE_RUNNING_MS;
}

export function staleRunningJobError(): string {
  return (
    "Stale RUNNING publish job failed closed. StoryLiner will not reset it to PENDING " +
    "(that can double-post). Check Facebook / Instagram / YouTube, then Return to Approved " +
    "if nothing went live."
  );
}
