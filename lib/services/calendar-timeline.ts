/** Calendar display convention, not an event's saved timezone. */
export const CALENDAR_TIME_ZONE = "America/Chicago";

const calendarDayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CALENDAR_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const calendarDay = new Intl.DateTimeFormat("en-US", {
  timeZone: CALENDAR_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const calendarTime = new Intl.DateTimeFormat("en-US", {
  timeZone: CALENDAR_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

function requireValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Calendar display requires a valid date.");
  }
}

/** Stable Chicago grouping key; never a UTC date or machine-local date. */
export function calendarDayKey(date: Date): string {
  requireValidDate(date);
  const parts = calendarDayParts.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (!value) throw new RangeError("Calendar date could not be formatted.");
    return value;
  };
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

export function calendarDayLabel(date: Date): string {
  requireValidDate(date);
  return calendarDay.format(date);
}

/** CDT/CST distinguishes repeated wall-clock times at the fall DST boundary. */
export function calendarTimeLabel(date: Date): string {
  requireValidDate(date);
  return calendarTime.format(date);
}

/** Doors/set times on another Chicago day retain their full saved date. */
export function calendarRelatedTimeLabel(date: Date, reference: Date): string {
  const sameDay = calendarDayKey(date) === calendarDayKey(reference);
  return sameDay
    ? calendarTimeLabel(date)
    : `${calendarDayLabel(date)} at ${calendarTimeLabel(date)}`;
}
