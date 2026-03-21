import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { StatCard } from "@/components/storyliner/stat-card";
import { ChevronLeft, ExternalLink, MessageSquare, Heart, Share2, BarChart3, Users, MousePointer2, Bookmark } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Post Details" };
export const dynamic = "force-dynamic";

export default async function PublishedPostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;

  const post = await prisma.publishedPost.findUnique({
    where: { id: postId },
    include: { band: true, platformAccount: true, publishLogs: true },
  });

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/published-posts">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Post Details</h1>
          <p className="text-sm text-muted-foreground">
            View performance metrics and logs for this post
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={post.platform} size="md" />
                <div>
                  <CardTitle className="text-base font-medium">Post Content</CardTitle>
                  <p className="text-xs text-muted-foreground">Published on {formatDateTime(post.publishedAt)}</p>
                </div>
              </div>
              {post.externalPostUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={post.externalPostUrl} target="_blank" rel="noopener noreferrer">
                    View on Platform <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <BandChip name={post.band.name} color={post.band.coverColor} />
                  <span className="text-sm font-medium text-muted-foreground">@{post.platformAccount.handle}</span>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 border border-border">
                  <p className="text-base whitespace-pre-wrap">{post.caption}</p>
                  {post.hashtags.length > 0 && (
                    <p className="text-sm text-primary mt-4 font-medium">{post.hashtags.join(" ")}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Reach"
              value={post.reach?.toLocaleString() ?? "—"}
              icon={Users}
            />
            <StatCard
              label="Impressions"
              value={post.impressions?.toLocaleString() ?? "—"}
              icon={BarChart3}
            />
            <StatCard
              label="Likes"
              value={post.likes?.toLocaleString() ?? "—"}
              icon={Heart}
            />
            <StatCard
              label="Comments"
              value={post.comments?.toLocaleString() ?? "—"}
              icon={MessageSquare}
            />
            <StatCard
              label="Shares"
              value={post.shares?.toLocaleString() ?? "—"}
              icon={Share2}
            />
            <StatCard
              label="Saves"
              value={post.saves?.toLocaleString() ?? "—"}
              icon={Bookmark}
            />
            <StatCard
              label="Clicks"
              value={post.clicks?.toLocaleString() ?? "—"}
              icon={MousePointer2}
            />
            <StatCard
              label="Engagement"
              value={post.reach && post.reach > 0 ? ((( (post.likes || 0) + (post.comments || 0) + (post.shares || 0) ) / post.reach) * 100).toFixed(1) + "%" : "—"}
              icon={BarChart3}
            />
          </div>
        </div>

        {/* Sidebar / Logs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publish Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {post.publishLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No logs available.</p>
                ) : (
                  post.publishLogs.map((log) => (
                    <div key={log.id} className="text-xs space-y-1 pb-3 border-b border-border last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold ${log.success ? 'text-green-500' : 'text-red-500'}`}>
                          {log.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                        <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p className="text-muted-foreground">Adapter: <span className="text-foreground">{log.adapter}</span></p>
                      {log.responseCode && <p className="text-muted-foreground">HTTP: <span className="text-foreground">{log.responseCode}</span></p>}
                      {log.errorMessage && <p className="text-red-400 mt-1">{log.errorMessage}</p>}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
