import type { Prisma } from "@prisma/client";

/**
 * PUBLISH_POST job payload helpers.
 * Used so a retry after a live adapter write cannot silently post twice.
 */

export type PublishJobPayload = {
  scheduledPostId: string;
  adapterWriteStarted: boolean;
};

export const PENDING_SCHEDULED_POST_ID = "__pending__";

export function parsePublishJobPayload(payload: unknown): PublishJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PUBLISH_POST job is missing a payload object.");
  }

  const record = payload as Record<string, unknown>;
  const scheduledPostId = record.scheduledPostId;
  if (typeof scheduledPostId !== "string" || !scheduledPostId.trim()) {
    throw new Error("PUBLISH_POST job is missing scheduledPostId.");
  }
  if (scheduledPostId === PENDING_SCHEDULED_POST_ID) {
    throw new Error(
      "PUBLISH_POST job still has a pending scheduledPostId placeholder. " +
        "Refusing to publish — the schedule transaction did not finish."
    );
  }

  return {
    scheduledPostId,
    adapterWriteStarted: record.adapterWriteStarted === true,
  };
}

export function adapterRetryRefusedReason(): string {
  return (
    "Refusing to call the social adapter again. A previous attempt already reached the write. " +
    "Check Facebook / Instagram / YouTube for a live post. StoryLiner will not double-publish. " +
    "Return the draft to Approved if you need a new schedule."
  );
}

/**
 * After the adapter is invoked, never clear the write claim.
 *
 * Graph 200-without-id, timeouts, and other success=false results can still
 * mean Facebook / Instagram / YouTube accepted a write. Clearing the claim
 * (the #5 retry path) lets the worker post twice.
 */
export function shouldClearAdapterWriteStarted(): boolean {
  return false;
}

export function isAdapterRetryRefusedError(message: string): boolean {
  return message.includes("will not double-publish");
}

/**
 * After the write claim is set, another PENDING attempt cannot succeed
 * (handlePublishPost refuses the adapter). Putting the job back on the
 * queue makes it look Unschedule-able and can double-post if the claim
 * is ever cleared. Fail closed immediately.
 *
 * Unreadable payloads fail closed — they may already have reached
 * Facebook / Instagram / YouTube.
 */
export function shouldFailPublishRetry(options: {
  payload: unknown;
  errorMessage: string;
}): boolean {
  if (isAdapterRetryRefusedError(options.errorMessage)) return true;
  return jobMayHaveStartedAdapterWrite(options.payload);
}

/**
 * Fail closed when the payload cannot be parsed — treat it as a write that
 * may already have reached Facebook / Instagram / YouTube.
 */
export function jobMayHaveStartedAdapterWrite(payload: unknown): boolean {
  try {
    return parsePublishJobPayload(payload).adapterWriteStarted;
  } catch {
    return true;
  }
}

export function withAdapterWriteStarted(
  payload: unknown,
  started: boolean
): Prisma.InputJsonObject {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  return { ...base, adapterWriteStarted: started } as Prisma.InputJsonObject;
}
