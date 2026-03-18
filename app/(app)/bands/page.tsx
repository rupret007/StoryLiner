import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Music2, ArrowRight, Plus } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bands" };
export const dynamic = "force-dynamic";

export default async function BandsPage() {
  const bands = await prisma.band.findMany({
    where: { isActive: true },
    include: {
      voiceProfile: { select: { defaultTone: true } },
      platformAccounts: { select: { platform: true, isConnected: true } },
      _count: {
        select: {
          drafts: true,
          publishedPosts: true,
          events: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {bands.length} {bands.length === 1 ? "band" : "bands"} configured
          </p>
        </div>
        <Button asChild>
          <Link href="/bands/new">
            <Plus className="h-4 w-4" />
            Add Band
          </Link>
        </Button>
      </div>

      {bands.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="No bands yet"
          description="Add your first band to start generating content and planning shows."
          action={
            <Button asChild>
              <Link href="/bands/new">Add Band</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bands.map((band) => (
            <Link key={band.id} href={`/bands/${band.id}`}>
              <Card className="hover:border-primary/40 transition-all group cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className="h-14 w-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                      style={{ backgroundColor: band.coverColor }}
                    >
                      {band.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {band.name}
                          </h3>
                          {band.genre && (
                            <p className="text-xs text-muted-foreground mt-0.5">{band.genre}</p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                      </div>

                      {band.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {band.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {band.voiceProfile && (
                          <Badge variant="secondary" className="text-xs">
                            Voice configured
                          </Badge>
                        )}
                        {band.location && (
                          <Badge variant="outline" className="text-xs">
                            {band.location}
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-4 mt-3 pt-3 border-t border-border">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {band._count.drafts}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Drafts</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {band._count.publishedPosts}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Published</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {band._count.events}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Events</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {band.platformAccounts.filter((a) => a.isConnected).length}/
                            {band.platformAccounts.length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Platforms</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
