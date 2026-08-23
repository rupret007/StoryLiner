import {
  adapterRetryRefusedReason,
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
  it("keeps the claim after a live-looking success so retries cannot double-post", () => {
    expect(
      shouldClearAdapterWriteStarted({ success: true, isDraftOnly: false })
    ).toBe(false);
  });

  it("clears the claim after a failed live write so a transient API error can retry", () => {
    expect(
      shouldClearAdapterWriteStarted({ success: false, isDraftOnly: false })
    ).toBe(true);
  });

  it("keeps the claim on draft-only so the worker does not keep hitting the adapter", () => {
    expect(
      shouldClearAdapterWriteStarted({ success: false, isDraftOnly: true })
    ).toBe(false);
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
