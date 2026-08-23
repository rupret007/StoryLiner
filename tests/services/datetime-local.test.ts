import { formatDatetimeLocalValue } from "@/lib/utils";

describe("formatDatetimeLocalValue", () => {
  it("uses local calendar fields, not UTC from toISOString", () => {
    const date = new Date(2026, 7, 23, 9, 5, 30, 0);
    expect(formatDatetimeLocalValue(date)).toBe("2026-08-23T09:05");
  });

  it("pads single-digit months, days, hours, and minutes", () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(formatDatetimeLocalValue(date)).toBe("2026-01-02T03:04");
  });
});
