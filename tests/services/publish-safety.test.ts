import {
  assertSafeToLivePublish,
  canRescheduleJob,
} from "@/lib/services/publish/safety";

describe("assertSafeToLivePublish", () => {
  it("allows mock-mode publish for disconnected seed accounts", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "mock",
      platform: "FACEBOOK",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses real Facebook publish when the account is not connected", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not connected/i);
    }
  });

  it("refuses real Facebook publish when the account is inactive", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: true,
      accountIsActive: false,
    });
    expect(result.ok).toBe(false);
  });

  it("allows real Facebook publish only after the account is connected", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: true,
      accountIsActive: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("does not block unsupported real-mode platforms (draft-only fallback handles them)", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "TWITTER",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("canRescheduleJob", () => {
  it("allows reschedule when there is no job yet", () => {
    expect(canRescheduleJob(null)).toBe(true);
    expect(canRescheduleJob(undefined)).toBe(true);
  });

  it("allows reschedule only while the job is still PENDING", () => {
    expect(canRescheduleJob("PENDING")).toBe(true);
    expect(canRescheduleJob("RUNNING")).toBe(false);
    expect(canRescheduleJob("DONE")).toBe(false);
    expect(canRescheduleJob("FAILED")).toBe(false);
  });
});
