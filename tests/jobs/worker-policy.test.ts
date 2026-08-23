import {
  STALE_RUNNING_MS,
  UNIMPLEMENTED_JOB_TYPES,
  isStaleRunningJob,
  isUnimplementedJobType,
  staleRunningJobError,
  unimplementedJobError,
} from "@/lib/jobs/worker-policy";

describe("worker-policy", () => {
  it("treats recap, clip, and reminder jobs as unimplemented", () => {
    expect(UNIMPLEMENTED_JOB_TYPES).toEqual([
      "GENERATE_RECAP",
      "GENERATE_CLIP_FOLLOW_UP",
      "SEND_LIVESTREAM_REMINDER",
    ]);
    for (const type of UNIMPLEMENTED_JOB_TYPES) {
      expect(isUnimplementedJobType(type)).toBe(true);
    }
  });

  it("does not treat PUBLISH_POST as unimplemented", () => {
    expect(isUnimplementedJobType("PUBLISH_POST")).toBe(false);
  });

  it("fails closed with a clear error instead of marking DONE", () => {
    expect(unimplementedJobError("GENERATE_RECAP")).toMatch(/not implemented/i);
  });

  it("treats a RUNNING job older than the stale window as dead", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const stale = new Date(now.getTime() - STALE_RUNNING_MS);
    expect(isStaleRunningJob(stale, now)).toBe(true);
    expect(isStaleRunningJob(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(isStaleRunningJob(null, now)).toBe(false);
    expect(staleRunningJobError()).toMatch(/will not reset it to PENDING/i);
  });
});
