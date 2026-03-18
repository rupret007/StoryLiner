import { prisma } from "@/lib/prisma";
import { buildAnalyticsReport } from "@/lib/analytics/heuristics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { BarChart3, TrendingUp, TrendingDown, Clock, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string }>;
}) {
  const { bandId } = await searchParams;

  const [bands, snapshots, publishedPosts] = await Promise.all([
    prisma.band.findMany({ where: { isActive: true } }),
    prisma.analyticsSnapshot.findMany({
      where: bandId ? { bandId } : {},
      orderBy: { snapshotDate: "desc" },
      take: 500,
    }),
    prisma.publishedPost.findMany({
      where: bandId ? { bandId } : {},
      include: { band: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
    }),
  ]);

  const selectedBand = bandId ? bands.find((b) => b.id === bandId) : null;
  const report = buildAnalyticsReport(snapshots);

  const totalPosts = publishedPosts.length;
  const totalEngagement = publishedPosts.reduce((sum, p) => sum + (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Band filter */}
      <div className="flex flex-wrap gap-2">
        <Button variant={!bandId ? "secondary" : "ghost"} size="sm" asChild>
          <Link href="/analytics">All Bands</Link>
        </Button>
        {bands.map((band) => (
          <Button
            key={band.id}
            variant={bandId === band.id ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={`/analytics?bandId=${band.id}`}>{band.name}</Link>
          </Button>
        ))}
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Published Posts</p>
            <p className="text-3xl font-bold text-foreground">{totalPosts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Engagement</p>
            <p className="text-3xl font-bold text-foreground">{totalEngagement.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Data Points</p>
            <p className="text-3xl font-bold text-foreground">{snapshots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Patterns Found</p>
            <p className="text-3xl font-bold text-foreground">
              {report.bestPatterns.length + report.weakPatterns.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Analytics accumulate as posts are published. The seed data includes sample snapshots to preview this feature."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best patterns */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                What's working
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.bestPatterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  More posts needed to identify patterns.
                </p>
              ) : (
                report.bestPatterns.map((pattern, i) => (
                  <div key={i} className="p-3 rounded-lg bg-emerald-600/10 border border-emerald-600/20">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">
                        {pattern.label}
                      </p>
                      <Badge
                        variant={pattern.confidence === "high" ? "success" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {pattern.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{pattern.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pattern.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Weak patterns */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-400" />
                What to avoid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.weakPatterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No weak patterns identified yet.
                </p>
              ) : (
                report.weakPatterns.map((pattern, i) => (
                  <div key={i} className="p-3 rounded-lg bg-rose-600/10 border border-rose-600/20">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs text-rose-400 font-medium uppercase tracking-wider">
                        {pattern.label}
                      </p>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {pattern.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{pattern.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pattern.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Timing recommendations */}
          {report.timingRecommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  Best times to post
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.timingRecommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <PlatformIcon platform={rec.platform} />
                    <div className="flex-1">
                      <div className="flex gap-2 flex-wrap mb-1">
                        {rec.bestDays.map((day) => (
                          <Badge key={day} variant="secondary" className="text-xs">{day}</Badge>
                        ))}
                        {rec.bestHours.map((hour) => (
                          <Badge key={hour} variant="outline" className="text-xs">{hour}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{rec.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Content recommendations */}
          {report.contentTypeRecommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  Recommended next
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.contentTypeRecommendations.map((rec, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-amber-600/10 border border-amber-600/20">
                    <div>
                      <p className="text-sm font-medium text-foreground">{rec.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/content-studio">Create</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Transparency note */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">How analytics work:</span> StoryLiner uses transparent heuristics — grouping your post data by campaign type, tone, platform, day, and time, then calculating average engagement rates. No fake ML claims. Recommendations require at least 2 data points and show confidence levels. The more you post, the more accurate the insights become.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
