import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatRelative, formatDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Published Posts" };
export const dynamic = "force-dynamic";

export default async function PublishedPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string }>;
}) {
  const { bandId } = await searchParams;

  const [bands, posts] = await Promise.all([
    prisma.band.findMany({ where: { isActive: true } }),
    prisma.publishedPost.findMany({
      where: bandId ? { bandId } : {},
      include: { band: true, platformAccount: true },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant={!bandId ? "secondary" : "ghost"} size="sm" asChild>
            <Link href="/published-posts">All</Link>
          </Button>
          {bands.map((band) => (
            <Button
              key={band.id}
              variant={bandId === band.id ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={`/published-posts?bandId=${band.id}`}>{band.name}</Link>
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{posts.length} posts</p>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No published posts yet"
          description="Published posts will appear here after your scheduled posts go live."
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <PlatformIcon platform={post.platform} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <BandChip name={post.band.name} color={post.band.coverColor} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(post.publishedAt)}
                      </span>
                      <Link
                        href={`/published-posts/${post.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Details
                      </Link>
                      {post.externalPostUrl && (
                        <a
                          href={post.externalPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary flex items-center gap-1 hover:underline"
                        >
                          View post <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{post.caption}</p>
                    {post.hashtags.length > 0 && (
                      <p className="text-xs text-primary mt-1">{post.hashtags.join(" ")}</p>
                    )}

                    {/* Engagement metrics if present */}
                    {(post.likes !== null || post.comments !== null || post.shares !== null) && (
                      <div className="flex gap-4 mt-3 pt-2 border-t border-border">
                        {post.impressions !== null && (
                          <span className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{post.impressions.toLocaleString()}</span> impressions
                          </span>
                        )}
                        {post.likes !== null && (
                          <span className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{post.likes}</span> likes
                          </span>
                        )}
                        {post.comments !== null && (
                          <span className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{post.comments}</span> comments
                          </span>
                        )}
                        {post.shares !== null && (
                          <span className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{post.shares}</span> shares
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
