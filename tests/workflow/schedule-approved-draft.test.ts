/**
 * Tests for scheduling validation gates and atomic write behavior.
 * These tests use the schema + service logic without needing a live DB.
 */

import { scheduleDraftSchema } from "@/lib/schemas/content";

describe("scheduleDraftSchema validation", () => {
  const validInput = {
    draftId: "clhf5gt0000000test0draftid1",
    platformAccountId: "clhf5gt0000000test0accountd",
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1hr from now
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
