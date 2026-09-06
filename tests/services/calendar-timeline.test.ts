import {
  CALENDAR_TIME_ZONE,
  calendarDayKey,
  calendarDayLabel,
  calendarRelatedTimeLabel,
  calendarTimeLabel,
} from "@/lib/services/calendar-timeline";

describe("Calendar display in America/Chicago", () => {
  it("shows an evening instant on its Chicago date with the actual clock time", () => {
    const evening = new Date("2026-09-06T00:30:00.000Z");

    expect(CALENDAR_TIME_ZONE).toBe("America/Chicago");
    expect(calendarDayKey(evening)).toBe("2026-09-05");
    expect(calendarDayLabel(evening)).toBe("Sat, Sep 5, 2026");
    expect(calendarTimeLabel(evening)).toBe("7:30 PM CDT");
  });

  it("groups records together across UTC midnight when their Chicago day matches", () => {
    const afternoon = new Date("2026-09-05T20:45:00.000Z");
    const evening = new Date("2026-09-06T00:30:00.000Z");

    expect(calendarDayKey(afternoon)).toBe("2026-09-05");
    expect(calendarDayKey(evening)).toBe(calendarDayKey(afternoon));
  });

  it("separates Chicago days even when both records have the same UTC date", () => {
    expect(calendarDayKey(new Date("2026-09-06T04:59:00.000Z"))).toBe("2026-09-05");
    expect(calendarDayKey(new Date("2026-09-06T05:00:00.000Z"))).toBe("2026-09-06");
  });

  it("keeps the previous year for an evening before Chicago New Year's Day", () => {
    const evening = new Date("2027-01-01T01:00:00.000Z");

    expect(calendarDayKey(evening)).toBe("2026-12-31");
    expect(calendarDayLabel(evening)).toBe("Thu, Dec 31, 2026");
    expect(calendarTimeLabel(evening)).toBe("7:00 PM CST");
  });

  it("jumps from 1:59 CST to 3:00 CDT over the spring gap", () => {
    const before = new Date("2026-03-08T07:59:00.000Z");
    const after = new Date("2026-03-08T08:00:00.000Z");

    expect(calendarDayKey(before)).toBe("2026-03-08");
    expect(calendarDayKey(after)).toBe(calendarDayKey(before));
    expect(calendarTimeLabel(before)).toBe("1:59 AM CST");
    expect(calendarTimeLabel(after)).toBe("3:00 AM CDT");
  });

  it("distinguishes both occurrences of 1:30 AM during the fall repeated hour", () => {
    const first = new Date("2026-11-01T06:30:00.000Z");
    const second = new Date("2026-11-01T07:30:00.000Z");

    expect(calendarDayKey(first)).toBe("2026-11-01");
    expect(calendarDayKey(second)).toBe(calendarDayKey(first));
    expect(calendarTimeLabel(first)).toBe("1:30 AM CDT");
    expect(calendarTimeLabel(second)).toBe("1:30 AM CST");
    expect(calendarRelatedTimeLabel(second, first)).toBe("1:30 AM CST");
  });

  it("shows only the time for a saved doors time on the same Chicago day", () => {
    expect(calendarRelatedTimeLabel(
      new Date("2026-09-05T23:00:00.000Z"),
      new Date("2026-09-06T00:30:00.000Z"),
    )).toBe("6:00 PM CDT");
  });

  it("includes the saved date when a set crosses Chicago midnight", () => {
    expect(calendarRelatedTimeLabel(
      new Date("2026-09-06T05:30:00.000Z"),
      new Date("2026-09-06T00:30:00.000Z"),
    )).toBe("Sun, Sep 6, 2026 at 12:30 AM CDT");
  });

  it("includes the saved date for a related time on a prior Chicago day", () => {
    expect(calendarRelatedTimeLabel(
      new Date("2026-09-05T04:30:00.000Z"),
      new Date("2026-09-06T00:30:00.000Z"),
    )).toBe("Fri, Sep 4, 2026 at 11:30 PM CDT");
  });

  it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])(
    "keeps the same Calendar output when the host timezone is %s",
    (hostTimezone) => {
      const previousTimezone = process.env.TZ;
      try {
        process.env.TZ = hostTimezone;
        const instant = new Date("2026-09-06T00:30:00.000Z");
        expect(calendarDayKey(instant)).toBe("2026-09-05");
        expect(calendarDayLabel(instant)).toBe("Sat, Sep 5, 2026");
        expect(calendarTimeLabel(instant)).toBe("7:30 PM CDT");
      } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
      }
    },
  );

  it.each([
    ["day key", calendarDayKey],
    ["day label", calendarDayLabel],
    ["time label", calendarTimeLabel],
  ] as const)("rejects an invalid date for %s", (_label, format) => {
    expect(() => format(new Date("invalid"))).toThrow("Calendar display requires a valid date.");
  });

  it("rejects either invalid date when comparing related times", () => {
    const valid = new Date("2026-09-06T00:30:00.000Z");
    const invalid = new Date("invalid");

    expect(() => calendarRelatedTimeLabel(invalid, valid)).toThrow(RangeError);
    expect(() => calendarRelatedTimeLabel(valid, invalid)).toThrow(RangeError);
  });
});
