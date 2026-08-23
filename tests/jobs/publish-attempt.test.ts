import {
  adapterRetryRefusedReason,
  isAdapterRetryRefusedError,
  jobMayHaveStartedAdapterWrite,
  parsePublishJobPayload,
  PENDING_SCHEDULED_POST_ID,
  shouldClearAdapterWriteStarted,
  shouldFailPublishRetry,
  withAdapterWriteStarted,
} from "@/lib/jobs/publish-attempt";

describe("parsePublishJobPayload", () => {
  it("reads a real scheduledPostId", () => {
    expect(parsePublishJobPayload({ scheduledPostId: "sched_1" })).toEqual({
      scheduledPostId: "sched_1",
      adapterWriteStarted: false,
    });
  });

  it("refuses the pending placeholder so a half-written schedule cannot publish", () => {
    expect(() =>
      parsePublishJobPayload({ scheduledPostId: PENDING_SCHEDULED_POST_ID })
    ).toThrow(/placeholder/i);
  });

  it("refuses a missing payload", () => {
    expect(() => parsePublishJobPayload(null)).toThrow(/payload/i);
  });
});

describe("adapter write claim", () => {
  it("never clears the write claim — success, API errors, and draft-only all stay claimed", () => {
    expect(shouldClearAdapterWriteStarted()).toBe(false);
  });

  it("treats an unreadable payload as a write that may already have started", () => {
    expect(jobMayHaveStartedAdapterWrite({ scheduledPostId: "sched_1" })).toBe(false);
    expect(
      jobMayHaveStartedAdapterWrite({
        scheduledPostId: "sched_1",
        adapterWriteStarted: true,
      })
    ).toBe(true);
    expect(jobMayHaveStartedAdapterWrite(null)).toBe(true);
  });

  it("recognizes the no-retry double-post refusal", () => {
    expect(isAdapterRetryRefusedError(adapterRetryRefusedReason())).toBe(true);
    expect(isAdapterRetryRefusedError("Graph API rejected the write")).toBe(false);
  });

  it("fails retries immediately once the write claim is set", () => {
    const claimed = { scheduledPostId: "sched_1", adapterWriteStarted: true };
    const clean = { scheduledPostId: "sched_1", adapterWriteStarted: false };

    expect(
      shouldFailPublishRetry({
        payload: claimed,
        errorMessage: "Adapter reported success without an external post id.",
      })
    ).toBe(true);
    expect(
      shouldFailPublishRetry({
        payload: claimed,
        errorMessage: "Graph API rejected the write",
      })
    ).toBe(true);
    expect(
      shouldFailPublishRetry({
        payload: clean,
        errorMessage: adapterRetryRefusedReason(),
      })
    ).toBe(true);
    expect(
      shouldFailPublishRetry({
        payload: clean,
        errorMessage: "Refusing live Instagram publish: a public https image or video URL is required.",
      })
    ).toBe(false);
    expect(
      shouldFailPublishRetry({
        payload: null,
        errorMessage: "PUBLISH_POST job is missing a payload object.",
      })
    ).toBe(true);
  });

  it("persists the claim flag on the job payload", () => {
    expect(withAdapterWriteStarted({ scheduledPostId: "sched_1" }, true)).toEqual({
      scheduledPostId: "sched_1",
      adapterWriteStarted: true,
    });
  });

  it("names Facebook / Instagram / YouTube in the retry refusal", () => {
    expect(adapterRetryRefusedReason()).toMatch(/Facebook/);
    expect(adapterRetryRefusedReason()).toMatch(/will not double-publish/i);
  });
});
