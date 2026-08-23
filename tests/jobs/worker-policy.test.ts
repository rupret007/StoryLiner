import {
  UNIMPLEMENTED_JOB_TYPES,
  isUnimplementedJobType,
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
});
