import {
  adapterRetryRefusedReason,
  isAdapterRetryRefusedError,
  jobMayHaveStartedAdapterWrite,
  parsePublishJobPayload,
  PENDING_SCHEDULED_POST_ID,
  shouldClearAdapterWriteStarted,
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
