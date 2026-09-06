import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import {
  calendarDayKey,
  calendarDayLabel,
  calendarRelatedTimeLabel,
  calendarTimeLabel,
} from "@/lib/services/calendar-timeline";
import { jobMayHaveStartedAdapterWrite } from "@/lib/jobs/publish-attempt";
import { reviewQueueFocusHref } from "@/lib/services/publish/review-snapshot";
import {
  upcomingScheduleBadge,
  writeStartedQueueWarning,
} from "@/lib/services/publish/safety";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [scheduledPosts, events, livestreams] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: { gte: now, lte: thirtyDaysOut },
      },
      include: { band: true, draft: true, job: true },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.event.findMany({
      where: {
        eventDate: { gte: now, lte: thirtyDaysOut },
        isCancelled: false,
      },
      include: { band: true },
      orderBy: { eventDate: "asc" },
    }),
    prisma.livestreamEvent.findMany({
      where: {
        scheduledFor: { gte: now, lte: thirtyDaysOut },
        isCancelled: false,
        isCompleted: false,
      },
      include: { band: true },
      orderBy: { scheduledFor: "asc" },
    }),
  ]);

  type CalendarItem =
    | { type: "post"; date: Date; data: typeof scheduledPosts[0] }
    | { type: "event"; date: Date; data: typeof events[0] }
    | { type: "stream"; date: Date; data: typeof livestreams[0] };

  const allItems: CalendarItem[] = [
    ...scheduledPosts.map((p) => ({ type: "post" as const, date: p.scheduledFor, data: p })),
    ...events.map((e) => ({ type: "event" as const, date: e.eventDate, data: e })),
    ...livestreams.map((l) => ({ type: "stream" as const, date: l.scheduledFor, data: l })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Day headings and clock labels use the same explicit planning timezone.
  // Keep absolute-time ordering, including the repeated hour when DST ends.
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of allItems) {
    const key = calendarDayKey(item.date);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Next 30 days — {allItems.length} items across {grouped.size} days
        </p>
        <p className="text-xs text-muted-foreground">
          Times shown in Central time (America/Chicago). CDT or CST follows each saved time.
        </p>
      </div>

      {allItems.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="Nothing scheduled in the next 30 days"
          description="Schedule approved posts or plan shows and streams to see them here."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, items]) => (
            <section key={dateKey} data-calendar-day={dateKey} aria-labelledby={`calendar-day-${dateKey}`}>
              <div className="flex items-center gap-3 mb-3">
                <h2 id={`calendar-day-${dateKey}`} className="text-sm font-semibold text-foreground">
                  <time dateTime={dateKey}>{calendarDayLabel(items[0].date)}</time>
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  if (item.type === "post") {
                    const post = item.data;
                    const writeStarted = post.job
                      ? jobMayHaveStartedAdapterWrite(post.job.payload)
                      : false;
                    const jobStatus = post.job?.status ?? null;
                    const badge = upcomingScheduleBadge({
                      jobStatus,
                      adapterWriteStarted: writeStarted,
                    });
                    return (
                      <Link
                        key={`post-${post.id}`}
                        data-calendar-item={`post-${post.id}`}
                        href={reviewQueueFocusHref(post.draft.id)}
                        className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
                      >
                        <div className="shrink-0 pt-0.5"><PlatformIcon platform={post.draft.platform} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <time dateTime={post.scheduledFor.toISOString()} className="text-sm font-semibold tabular-nums">
                              {calendarTimeLabel(post.scheduledFor)}
                            </time>
                            <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                          </div>
                          <p className="text-sm text-foreground line-clamp-2 break-words mt-1">{post.draft.caption}</p>
                          <BandChip name={post.band.name} color={post.band.coverColor} />
                          {writeStarted && (
                            <p className="text-xs text-amber-200 mt-1">
                              {writeStartedQueueWarning({ jobFailed: jobStatus === "FAILED" })}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  }
                  if (item.type === "event") {
                    const event = item.data;
                    return (
                      <div key={`event-${event.id}`} data-calendar-item={`event-${event.id}`} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/20 flex items-center justify-center">
                          <CalendarIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="min-w-0 max-w-full text-sm text-foreground font-medium break-words">{event.title}</p>
                            <Badge variant="secondary" className="text-xs">Show</Badge>
                          </div>
                          {(event.venue || event.city) && (
                            <p className="text-xs text-muted-foreground break-words">{[event.venue, event.city].filter(Boolean).join(", ")}</p>
                          )}
                          <BandChip name={event.band.name} color={event.band.coverColor} />
                          <dl className="mt-2 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Event</dt>
                              <dd><time dateTime={event.eventDate.toISOString()}>{calendarTimeLabel(event.eventDate)}</time></dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Doors</dt>
                              <dd>{event.doorsTime ? <time dateTime={event.doorsTime.toISOString()}>{calendarRelatedTimeLabel(event.doorsTime, event.eventDate)}</time> : "Not saved"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Set</dt>
                              <dd>{event.setTime ? <time dateTime={event.setTime.toISOString()}>{calendarRelatedTimeLabel(event.setTime, event.eventDate)}</time> : "Not saved"}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    );
                  }
                  const stream = item.data;
                  return (
                    <div key={`stream-${stream.id}`} data-calendar-item={`stream-${stream.id}`} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-primary/20">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">LIVE</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <time dateTime={stream.scheduledFor.toISOString()} className="text-sm font-semibold tabular-nums">
                            {calendarTimeLabel(stream.scheduledFor)}
                          </time>
                          <Badge variant="default" className="text-xs">Stream</Badge>
                        </div>
                        <p className="text-sm text-foreground font-medium break-words mt-1">{stream.title}</p>
                        <BandChip name={stream.band.name} color={stream.band.coverColor} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
