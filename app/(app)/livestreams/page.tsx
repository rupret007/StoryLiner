import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Radio, Plus, CheckCircle2, Calendar } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Livestreams" };
export const dynamic = "force-dynamic";

export default async function LivestreamsPage() {
  const [upcoming, past] = await Promise.all([
    prisma.livestreamEvent.findMany({
      where: { isCancelled: false, isCompleted: false },
      include: {
        band: true,
        destinations: true,
        runOfShowItems: { orderBy: { order: "asc" } },
      },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.livestreamEvent.findMany({
      where: { isCompleted: true },
      include: { band: true, destinations: true },
      orderBy: { scheduledFor: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {upcoming.length} upcoming · {past.length} completed
        </p>
        <Button asChild variant="outline">
          <Link href="/livestreams/new">
            <Plus className="h-4 w-4" />
            Plan Stream
          </Link>
        </Button>
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No livestreams planned"
          description="Plan a stream to get promo content, run-of-show items, banter prompts, and engagement ideas."
          action={
            <Button asChild>
              <Link href="/livestreams/new">Plan your first stream</Link>
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Upcoming</h2>
              {upcoming.map((stream) => (
                <Link key={stream.id} href={`/livestreams/${stream.id}`}>
                  <Card className="hover:border-primary/40 transition-all cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                          <Radio className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-foreground">{stream.title}</h3>
                              {stream.subtitle && (
                                <p className="text-sm text-muted-foreground">{stream.subtitle}</p>
                              )}
                            </div>
                            <Badge variant="info" className="shrink-0 text-xs">
                              Planned
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <BandChip name={stream.band.name} color={stream.band.coverColor} />
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDateTime(stream.scheduledFor)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {stream.destinations.map((dest) => (
                              <PlatformIcon key={dest.id} platform={dest.platform} showLabel />
                            ))}
                            {stream.runOfShowItems.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {stream.runOfShowItems.length} run-of-show items
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Completed</h2>
              {past.map((stream) => (
                <Link key={stream.id} href={`/livestreams/${stream.id}`}>
                  <Card className="opacity-75 hover:opacity-100 transition-all cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{stream.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <BandChip name={stream.band.name} color={stream.band.coverColor} />
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(stream.scheduledFor)}
                          </span>
                        </div>
                      </div>
                      <Badge variant="success" className="text-xs shrink-0">Done</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
