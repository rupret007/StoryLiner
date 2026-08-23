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
