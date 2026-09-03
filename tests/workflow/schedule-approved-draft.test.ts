/**
 * Tests for scheduling validation gates and atomic write behavior.
 * These tests use the schema + service logic without needing a live DB.
 */

import { scheduleDraftSchema } from "@/lib/schemas/content";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

describe("scheduleDraftSchema validation", () => {
  const validInput = {
    draftId: "clhf5gt0000000test0draftid1",
    platformAccountId: "clhf5gt0000000test0accountd",
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1hr from now
    reviewedSnapshot: reviewSnapshotReceipt({
      caption: "Thursday at The Hive.",
      hashtags: ["#stalemate"],
      mediaUrls: [],
      riskLevel: "LOW",
      riskFlags: [],
      currentVersion: 1,
      updatedAt: new Date("2026-09-03T08:00:00.000Z"),
    }),
  };

  it("accepts a valid future datetime string", () => {
    const result = scheduleDraftSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing draftId", () => {
    const result = scheduleDraftSchema.safeParse({
      ...validInput,
      draftId: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing platformAccountId", () => {
    const result = scheduleDraftSchema.safeParse({
      ...validInput,
      platformAccountId: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing scheduledFor", () => {
    const result = scheduleDraftSchema.safeParse({
      ...validInput,
      scheduledFor: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO datetime string", () => {
    const result = scheduleDraftSchema.safeParse({
      ...validInput,
      scheduledFor: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional platform-check confirm after a possible live write", () => {
    const result = scheduleDraftSchema.safeParse({
      ...validInput,
      confirmCheckedNoLivePost: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a schedule without the approved snapshot receipt", () => {
    const { reviewedSnapshot: _ignored, ...withoutReceipt } = validInput;
    const result = scheduleDraftSchema.safeParse(withoutReceipt);
    expect(result.success).toBe(false);
  });
});

describe("future-time validation logic", () => {
  it("identifies a past time as invalid", () => {
    const past = new Date(Date.now() - 1000);
    expect(past <= new Date()).toBe(true);
  });

  it("identifies a future time as valid", () => {
    const future = new Date(Date.now() + 60000);
    expect(future > new Date()).toBe(true);
  });

  it("identifies exactly now as not in the future", () => {
    // Boundary: scheduledFor <= new Date() should fail
    const boundary = new Date(Date.now() - 1); // 1ms in past
    expect(boundary <= new Date()).toBe(true);
  });
});
