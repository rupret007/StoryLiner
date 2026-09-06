import { renderToStaticMarkup } from "react-dom/server";
import CalendarPage from "@/app/(app)/calendar/page";
import { prisma } from "@/lib/prisma";

// Only the three existing reads are available. Any new database mutation fails
// the render instead of reaching a database or silently succeeding in a mock.
jest.mock("@/lib/prisma", () => ({ prisma: {
  scheduledPost: { findMany: jest.fn() },
  event: { findMany: jest.fn() },
  livestreamEvent: { findMany: jest.fn() },
} }));

const NOW = new Date("2026-09-05T12:00:00.000Z");
const band = { id: "fixture-band", name: "Fixture band", coverColor: "#123456" };
const findPosts = prisma.scheduledPost.findMany as jest.Mock;
const findEvents = prisma.event.findMany as jest.Mock;
const findStreams = prisma.livestreamEvent.findMany as jest.Mock;
const originalFetch = globalThis.fetch;

function post(id: string, iso: string, options: {
  draftId?: string;
  job?: { status: string; payload: unknown } | null;
} = {}) {
  return {
    id, scheduledFor: new Date(iso), status: "SCHEDULED", band,
    draft: { id: options.draftId ?? `draft-${id}`, platform: "INSTAGRAM", caption: `Fixture post ${id}` },
    job: options.job === undefined
      ? { status: "PENDING", payload: { scheduledPostId: id, adapterWriteStarted: false } }
      : options.job,
  };
}

function eventRow(id: string, iso: string, facts: {
  doorsTime?: Date | null;
  setTime?: Date | null;
} = {}) {
  return {
    id, title: `Fixture event ${id}`, eventDate: new Date(iso), band,
    venue: "Fixture hall", city: "Fixture city", isCancelled: false,
    doorsTime: facts.doorsTime ?? null, setTime: facts.setTime ?? null,
  };
}

function stream(id: string, iso: string) {
  return {
    id, title: `Fixture stream ${id}`, scheduledFor: new Date(iso), band,
    isCancelled: false, isCompleted: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
  findPosts.mockResolvedValue([]);
  findEvents.mockResolvedValue([]);
  findStreams.mockResolvedValue([]);
  globalThis.fetch = jest.fn().mockRejectedValue(new Error("No network allowed in Calendar fixture tests"));
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

async function render() {
  return renderToStaticMarkup(await CalendarPage());
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function markedMarkup(html: string, attribute: string, value: string) {
  const marker = `${attribute}="${value}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker}`);
  const start = html.lastIndexOf("<", markerIndex);
  const next = html.indexOf(`${attribute}=`, markerIndex + marker.length);
  return html.slice(start, next < 0 ? html.length : html.lastIndexOf("<", next));
}

function times(html: string) {
  return [...html.matchAll(/<time\b[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)]
    .map((match) => ({ iso: match[1], label: textContent(match[2]) }));
}

test("the actual Calendar keeps mixed entries across UTC midnight on their Central day", async () => {
  findPosts.mockResolvedValue([post("evening", "2026-09-05T23:30:00.000Z")]);
  findStreams.mockResolvedValue([stream("evening", "2026-09-06T00:30:00.000Z")]);
  findEvents.mockResolvedValue([
    eventRow("after-midnight", "2026-09-06T05:15:00.000Z"),
    eventRow("late-evening", "2026-09-06T04:45:00.000Z"),
  ]);

  const html = await render();
  expect(textContent(html)).toContain("Times shown in Central time (America/Chicago)");
  expect(textContent(html)).toContain("4 items across 2 days");
  expect([...html.matchAll(/data-calendar-day="([^"]+)"/g)].map((match) => match[1]))
    .toEqual(["2026-09-05", "2026-09-06"]);
  const saturday = markedMarkup(html, "data-calendar-day", "2026-09-05");
  expect(textContent(saturday)).toContain("Sat, Sep 5, 2026");
  expect(saturday).toContain('data-calendar-item="post-evening"');
  expect(saturday).toContain('data-calendar-item="stream-evening"');
  expect(saturday).toContain('data-calendar-item="event-late-evening"');
  expect(saturday).not.toContain('data-calendar-item="event-after-midnight"');
  const sunday = markedMarkup(html, "data-calendar-day", "2026-09-06");
  expect(textContent(sunday)).toContain("Sun, Sep 6, 2026");
  expect(sunday).toContain('data-calendar-item="event-after-midnight"');
});

test("posts and streams show actual Central clock times with their original machine-readable instants", async () => {
  findPosts.mockResolvedValue([post("clock", "2026-09-06T00:30:00.000Z")]);
  findStreams.mockResolvedValue([stream("clock", "2026-09-06T02:05:00.000Z")]);

  const html = await render();
  expect(times(markedMarkup(html, "data-calendar-item", "post-clock")))
    .toEqual([{ iso: "2026-09-06T00:30:00.000Z", label: "7:30 PM CDT" }]);
  expect(times(markedMarkup(html, "data-calendar-item", "stream-clock")))
    .toEqual([{ iso: "2026-09-06T02:05:00.000Z", label: "9:05 PM CDT" }]);
  expect(textContent(html)).toContain("Fixture band");
});

test("events distinguish the saved event, doors and set times and name missing facts honestly", async () => {
  findEvents.mockResolvedValue([
    eventRow("saved", "2026-09-06T01:00:00.000Z", {
      doorsTime: new Date("2026-09-06T00:00:00.000Z"),
      setTime: new Date("2026-09-06T02:15:00.000Z"),
    }),
    eventRow("missing", "2026-09-06T03:00:00.000Z"),
  ]);

  const html = await render();
  const saved = markedMarkup(html, "data-calendar-item", "event-saved");
  expect(textContent(saved)).toMatch(/Event\s*:?\s*8:00 PM CDT/);
  expect(textContent(saved)).toMatch(/Doors\s*:?\s*7:00 PM CDT/);
  expect(textContent(saved)).toMatch(/Set\s*:?\s*9:15 PM CDT/);
  expect(textContent(saved)).toContain("Fixture hall, Fixture city");
  expect(times(saved)).toEqual(expect.arrayContaining([
    { iso: "2026-09-06T01:00:00.000Z", label: "8:00 PM CDT" },
    { iso: "2026-09-06T00:00:00.000Z", label: "7:00 PM CDT" },
    { iso: "2026-09-06T02:15:00.000Z", label: "9:15 PM CDT" },
  ]));
  const missing = markedMarkup(html, "data-calendar-item", "event-missing");
  expect(textContent(missing)).toMatch(/Event\s*:?\s*10:00 PM CDT/);
  expect(textContent(missing)).toMatch(/Doors\s*:?\s*Not saved/);
  expect(textContent(missing)).toMatch(/Set\s*:?\s*Not saved/);
  expect(times(missing)).toEqual([{ iso: "2026-09-06T03:00:00.000Z", label: "10:00 PM CDT" }]);
});

test("doors and set saved on other Central days retain their full day and exact time", async () => {
  findEvents.mockResolvedValue([eventRow("cross-day", "2026-09-06T04:45:00.000Z", {
    doorsTime: new Date("2026-09-05T04:30:00.000Z"),
    setTime: new Date("2026-09-06T05:30:00.000Z"),
  })]);

  const html = await render();
  const labels = times(markedMarkup(html, "data-calendar-item", "event-cross-day"));
  expect(labels).toContainEqual({ iso: "2026-09-06T04:45:00.000Z", label: "11:45 PM CDT" });
  expect(labels.find((time) => time.iso === "2026-09-05T04:30:00.000Z")?.label)
    .toMatch(/Fri, Sep 4, 2026.*11:30 PM CDT/);
  expect(labels.find((time) => time.iso === "2026-09-06T05:30:00.000Z")?.label)
    .toMatch(/Sun, Sep 6, 2026.*12:30 AM CDT/);
  expect(html.match(/data-calendar-day=/g)).toHaveLength(1);
  expect(html).toContain('data-calendar-day="2026-09-05"');
});

test("the repeated fall hour is labelled CDT/CST and mixed entries remain in absolute-time order", async () => {
  jest.setSystemTime(new Date("2026-10-31T12:00:00.000Z"));
  findPosts.mockResolvedValue([
    post("late", "2026-11-01T07:45:00.000Z"),
    post("early", "2026-11-01T06:15:00.000Z"),
  ]);
  findEvents.mockResolvedValue([eventRow("middle", "2026-11-01T06:45:00.000Z")]);
  findStreams.mockResolvedValue([stream("repeat", "2026-11-01T07:15:00.000Z")]);

  const html = await render();
  expect([...html.matchAll(/data-calendar-item="([^"]+)"/g)].map((match) => match[1]))
    .toEqual(["post-early", "event-middle", "stream-repeat", "post-late"]);
  expect(times(markedMarkup(html, "data-calendar-item", "post-early")))
    .toEqual([{ iso: "2026-11-01T06:15:00.000Z", label: "1:15 AM CDT" }]);
  expect(times(markedMarkup(html, "data-calendar-item", "stream-repeat")))
    .toEqual([{ iso: "2026-11-01T07:15:00.000Z", label: "1:15 AM CST" }]);
  expect(html.match(/data-calendar-day=/g)).toHaveLength(1);
  expect(html).toContain('data-calendar-day="2026-11-01"');
});

test("the Calendar retains the existing bounded upcoming queries and cancelled/completed exclusions", async () => {
  await render();
  const window = { gte: NOW, lte: new Date("2026-10-05T12:00:00.000Z") };
  expect(findPosts).toHaveBeenCalledTimes(1);
  expect(findPosts).toHaveBeenCalledWith({
    where: { status: "SCHEDULED", scheduledFor: window },
    include: { band: true, draft: true, job: true },
    orderBy: { scheduledFor: "asc" },
  });
  expect(findEvents).toHaveBeenCalledTimes(1);
  expect(findEvents).toHaveBeenCalledWith({
    where: { eventDate: window, isCancelled: false },
    include: { band: true }, orderBy: { eventDate: "asc" },
  });
  expect(findStreams).toHaveBeenCalledTimes(1);
  expect(findStreams).toHaveBeenCalledWith({
    where: { scheduledFor: window, isCancelled: false, isCompleted: false },
    include: { band: true }, orderBy: { scheduledFor: "asc" },
  });
});

test("queue warnings and the exact review link remain, with no stream-detail or new action links", async () => {
  const draftId = "fixture draft&next=/publish#fragment";
  findPosts.mockResolvedValue([
    post("failed", "2026-09-06T00:00:00.000Z", {
      draftId, job: { status: "FAILED", payload: { scheduledPostId: "failed", adapterWriteStarted: true } },
    }),
    post("running", "2026-09-06T01:00:00.000Z", {
      job: { status: "RUNNING", payload: { scheduledPostId: "running", adapterWriteStarted: true } },
    }),
    post("unreadable", "2026-09-06T02:00:00.000Z", {
      job: { status: "PENDING", payload: null },
    }),
  ]);
  findEvents.mockResolvedValue([eventRow("read-only", "2026-09-06T03:00:00.000Z")]);
  findStreams.mockResolvedValue([stream("read-only", "2026-09-06T04:00:00.000Z")]);

  const html = await render();
  const failed = textContent(markedMarkup(html, "data-calendar-item", "post-failed"));
  expect(failed).toContain("Publish failed");
  expect(failed).toContain("StoryLiner did not mark this published. Check the platform before scheduling again.");
  expect(textContent(markedMarkup(html, "data-calendar-item", "post-running"))).toContain("Publishing");
  expect(textContent(markedMarkup(html, "data-calendar-item", "post-unreadable")))
    .toContain("A Facebook / Instagram / YouTube write may already be live.");
  expect(textContent(html)).not.toContain("Nothing was published");
  expect([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
    `/review-queue?focus=${encodeURIComponent(draftId)}`,
    "/review-queue?focus=draft-running",
    "/review-queue?focus=draft-unreadable",
  ]);
  expect(markedMarkup(html, "data-calendar-item", "stream-read-only")).not.toMatch(/<a\b/);
  expect(html).not.toMatch(/<(?:form|button|input)\b/);
});

test("an empty timeline keeps its honest upcoming empty state and no actionable controls", async () => {
  const html = await render();
  expect(textContent(html)).toContain("0 items across 0 days");
  expect(textContent(html)).toContain("Nothing scheduled in the next 30 days");
  expect(textContent(html)).toContain("Times shown in Central time (America/Chicago)");
  expect(html).not.toContain("data-calendar-day=");
  expect(html).not.toMatch(/<(?:a|form|button|input)\b/);
});
