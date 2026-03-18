import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/storyliner/stat-card";
import { BandChip } from "@/components/storyliner/band-chip";
import { StatusBadge } from "@/components/storyliner/status-badge";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Music2,
  ArrowRight,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { formatRelative, formatDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [bands, reviewQueue, scheduled, recentPublished, livestreams] =
    await Promise.all([
      prisma.band.findMany({ where: { isActive: true }, take: 10 }),
      prisma.draft.findMany({
        where: { status: "IN_REVIEW" },
        include: { band: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.scheduledPost.findMany({
        where: { status: "SCHEDULED" },
        include: { band: true, draft: true, platformAccount: true },
        orderBy: { scheduledFor: "asc" },
        take: 5,
      }),
      prisma.publishedPost.findMany({
        include: { band: true },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.livestreamEvent.findMany({
        where: { isCancelled: false, isCompleted: false },
        include: { band: true },
        orderBy: { scheduledFor: "asc" },
        take: 3,
      }),
    ]);

  const totalReviewCount = await prisma.draft.count({ where: { status: "IN_REVIEW" } });
  const totalScheduledCount = await prisma.scheduledPost.count({ where: { status: "SCHEDULED" } });
  const totalPublishedCount = await prisma.publishedPost.count();
  const totalBandCount = await prisma.band.count({ where: { isActive: true } });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Bands"
          value={totalBandCount}
          icon={Music2}
          color="#6d28d9"
        />
        <StatCard
          label="In Review"
          value={totalReviewCount}
          icon={ClipboardList}
          color="#f59e0b"
          trend={totalReviewCount > 0 ? { value: "needs attention", positive: false } : undefined}
        />
        <StatCard
          label="Scheduled"
          value={totalScheduledCount}
          icon={Clock}
          color="#3b82f6"
        />
        <StatCard
          label="Published"
          value={totalPublishedCount}
          icon={CheckCircle2}
          color="#10b981"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Review Queue */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Needs Review</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/review-queue" className="text-xs text-muted-foreground flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Queue is clear.
              </p>
            ) : (
              reviewQueue.map((draft) => (
                <Link
                  key={draft.id}
                  href="/review-queue"
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                >
                  <PlatformIcon platform={draft.platform} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {draft.caption}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <BandChip
                        name={draft.band.name}
                        color={draft.band.coverColor}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelative(draft.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Scheduled */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Scheduled</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/scheduled-posts" className="text-xs text-muted-foreground flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {scheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nothing scheduled yet.
              </p>
            ) : (
              scheduled.map((post) => (
                <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <PlatformIcon platform={post.draft.platform} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground line-clamp-1">
                      {post.draft.caption}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <BandChip name={post.band.name} color={post.band.coverColor} />
                      <span className="text-[10px] text-muted-foreground">
                        {formatDateTime(post.scheduledFor)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Livestreams + Recent */}
        <div className="space-y-4">
          {livestreams.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  Upcoming Streams
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/livestreams" className="text-xs text-muted-foreground flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {livestreams.map((stream) => (
                  <Link
                    key={stream.id}
                    href={`/livestreams/${stream.id}`}
                    className="block p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{stream.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <BandChip name={stream.band.name} color={stream.band.coverColor} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(stream.scheduledFor)}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              {bands.slice(0, 2).map((band) => (
                <Button key={band.id} variant="outline" size="sm" asChild>
                  <Link href={`/content-studio?bandId=${band.id}`}>
                    Generate for {band.name}
                  </Link>
                </Button>
              ))}
              <Button variant="outline" size="sm" asChild>
                <Link href="/campaign-builder">New Campaign</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/livestreams/new">Plan a Stream</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent publishes */}
      {recentPublished.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Recently Published</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/published-posts" className="text-xs text-muted-foreground flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPublished.map((post) => (
              <div key={post.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div
                  className="h-2 w-2 rounded-full shrink-0 bg-emerald-400"
                  title="Published"
                />
                <p className="text-xs text-muted-foreground flex-1 line-clamp-1">
                  {post.caption}
                </p>
                <BandChip name={post.band.name} color={post.band.coverColor} />
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatRelative(post.publishedAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Bands overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Your Bands</CardTitle>
        </CardHeader>
        <CardContent>
          {bands.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                No bands yet. Add your first band to get started.
              </p>
              <Button asChild>
                <Link href="/bands">Add Band</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bands.map((band) => (
                <Link
                  key={band.id}
                  href={`/bands/${band.id}`}
                  className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-all group"
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: band.coverColor }}
                  >
                    {band.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                      {band.name}
                    </p>
                    {band.genre && (
                      <p className="text-xs text-muted-foreground truncate">{band.genre}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
