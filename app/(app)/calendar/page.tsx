import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Calendar as CalendarIcon } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/utils";
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
      include: { band: true, draft: true },
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

  // Group all items by date
  type CalendarItem =
    | { type: "post"; date: Date; data: typeof scheduledPosts[0] }
    | { type: "event"; date: Date; data: typeof events[0] }
    | { type: "stream"; date: Date; data: typeof livestreams[0] };

  const allItems: CalendarItem[] = [
    ...scheduledPosts.map((p) => ({ type: "post" as const, date: p.scheduledFor, data: p })),
    ...events.map((e) => ({ type: "event" as const, date: e.eventDate, data: e })),
    ...livestreams.map((l) => ({ type: "stream" as const, date: l.scheduledFor, data: l })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by day
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of allItems) {
    const key = item.date.toISOString().split("T")[0];
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Next 30 days — {allItems.length} items across {grouped.size} days
      </p>

      {allItems.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="Nothing scheduled in the next 30 days"
          description="Schedule approved posts or plan shows and streams to see them here."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, items]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-semibold text-foreground">
                  {formatDate(new Date(dateKey + "T12:00:00"))}
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {items.map((item, i) => {
                  if (item.type === "post") {
                    const post = item.data as typeof scheduledPosts[0];
                    return (
                      <div key={`post-${post.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                        <PlatformIcon platform={post.draft.platform} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-1">{post.draft.caption}</p>
                          <BandChip name={post.band.name} color={post.band.coverColor} />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDateTime(post.scheduledFor).split(",")[1]?.trim()}
                        </span>
                        <Badge variant="info" className="text-xs shrink-0">Post</Badge>
                      </div>
                    );
                  }
                  if (item.type === "event") {
                    const event = item.data as typeof events[0];
                    return (
                      <div key={`event-${event.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                          <CalendarIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium">{event.title}</p>
                          {event.venue && (
                            <p className="text-xs text-muted-foreground">{event.venue}{event.city ? `, ${event.city}` : ""}</p>
                          )}
                          <BandChip name={event.band.name} color={event.band.coverColor} />
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">Show</Badge>
                      </div>
                    );
                  }
                  if (item.type === "stream") {
                    const stream = item.data as typeof livestreams[0];
                    return (
                      <div key={`stream-${stream.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-primary/20">
                        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">LIVE</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium">{stream.title}</p>
                          <BandChip name={stream.band.name} color={stream.band.coverColor} />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDateTime(stream.scheduledFor).split(",")[1]?.trim()}
                        </span>
                        <Badge variant="default" className="text-xs shrink-0">Stream</Badge>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
