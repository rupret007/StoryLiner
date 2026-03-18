import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { ArrowLeft, Radio, ListChecks, MessageSquare, Share2, Megaphone } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Plan a Stream" };
export const dynamic = "force-dynamic";

export default async function NewLivestreamPage() {
  const bands = await prisma.band.findMany({ where: { isActive: true } });
  const existingStream = await prisma.livestreamEvent.findFirst({
    where: { isCancelled: false },
    include: { band: true },
    orderBy: { scheduledFor: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/livestreams">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-bold">Plan a Livestream</h2>
          <p className="text-sm text-muted-foreground">
            Set up stream details, run-of-show items, promo content, and banter prompts.
          </p>
        </div>
      </div>

      {/* What this will do */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">What planning a stream gets you</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { icon: Megaphone, label: "Promo content", desc: "Announcement, reminder, and going-live-now drafts auto-generated for each platform." },
            { icon: ListChecks, label: "Run of show", desc: "Build a timed agenda: sound check, intro, song sets, breaks, Q&A, outro." },
            { icon: MessageSquare, label: "Banter prompts", desc: "AI-generated talking points and audience engagement ideas for each segment." },
            { icon: Share2, label: "Multi-destination", desc: "Target YouTube, Twitch, or any platform — content adapts per destination." },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-600/30 bg-amber-950/10">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">Creation form coming next sprint</p>
          </div>
          <p className="text-sm text-muted-foreground">
            The backend, AI generation, and detail page are fully functional. The creation form
            is the next step. For now, explore a pre-seeded stream to see everything it unlocks.
          </p>

          {existingStream && (
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <BandChip name={existingStream.band.name} color={existingStream.band.coverColor} />
              <p className="text-sm text-foreground flex-1 truncate">{existingStream.title}</p>
              <Button size="sm" asChild>
                <Link href={`/livestreams/${existingStream.id}`}>View stream</Link>
              </Button>
            </div>
          )}

          {bands.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2">
                In the meantime, generate promo content for an upcoming stream:
              </p>
              <div className="flex flex-wrap gap-2">
                {bands.map((band) => (
                  <Button key={band.id} variant="outline" size="sm" asChild>
                    <Link href={`/content-studio?bandId=${band.id}`}>
                      Promo for {band.name}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
