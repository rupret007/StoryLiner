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

/** Transient adapter failures (success=false, not draft-only) may retry. */
export function shouldClearAdapterWriteStarted(result: {
  success: boolean;
  isDraftOnly?: boolean;
}): boolean {
  return result.success === false && result.isDraftOnly !== true;
}

export function withAdapterWriteStarted(
  payload: unknown,
  started: boolean
): Record<string, unknown> {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  return { ...base, adapterWriteStarted: started };
}
