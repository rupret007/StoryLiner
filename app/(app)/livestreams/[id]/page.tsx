import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { ArrowLeft, Radio } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const stream = await prisma.livestreamEvent.findUnique({ where: { id } });
  return { title: stream?.title ?? "Livestream" };
}

export default async function LivestreamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const stream = await prisma.livestreamEvent.findUnique({
    where: { id },
    include: {
      band: { include: { voiceProfile: true } },
      runOfShowItems: { orderBy: { order: "asc" } },
      destinations: true,
    },
  });

  if (!stream) notFound();

  // Generate AI content for stream
  const llm = getLlmAdapter();
  const [talkingPoints, engagementPrompts] = await Promise.all([
    llm.generateTalkingPoints({
      livestreamTitle: stream.title,
      bandName: stream.band.name,
      runOfShowItems: stream.runOfShowItems.map((r) => r.title),
    }),
    llm.generateEngagementPrompts({
      bandName: stream.band.name,
      platform: stream.destinations[0]?.platform ?? "YOUTUBE",
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/livestreams">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-foreground">{stream.title}</h2>
              {stream.subtitle && (
                <p className="text-muted-foreground">{stream.subtitle}</p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <BandChip name={stream.band.name} color={stream.band.coverColor} size="md" />
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(stream.scheduledFor)}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm">Edit Stream</Button>
              <Button size="sm">
                <Radio className="h-4 w-4" />
                Generate Promo Posts
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="runofshow">
        <TabsList className="flex-wrap">
          <TabsTrigger value="runofshow">Run of Show</TabsTrigger>
          <TabsTrigger value="talking">Talking Points</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="destinations">Destinations</TabsTrigger>
          <TabsTrigger value="gear">Gear</TabsTrigger>
        </TabsList>

        <TabsContent value="runofshow" className="mt-4 space-y-3">
          {stream.runOfShowItems.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No run-of-show items yet. Add segments to build your stream plan.
              </CardContent>
            </Card>
          ) : (
            stream.runOfShowItems.map((item, i) => (
              <Card key={item.id}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{item.title}</p>
                      {item.duration && (
                        <Badge variant="outline" className="text-xs">{item.duration}min</Badge>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>
                    )}
                    {item.banterPrompts.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Banter prompts:</p>
                        {item.banterPrompts.map((prompt, j) => (
                          <p key={j} className="text-xs text-foreground">— {prompt}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="talking" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">AI-Generated Talking Points</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-4">
                These are prompts for if you freeze up or need a bridge. Not scripts.
              </p>
              {talkingPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="text-primary font-bold text-xs shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-foreground">{point}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Engagement Prompts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-4">
                Drop these in chat or say them out loud to get your audience talking.
              </p>
              {engagementPrompts.map((prompt, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="text-primary text-xs shrink-0">—</span>
                  <p className="text-sm text-foreground">{prompt}</p>
                </div>
              ))}
              {stream.pinnedComment && (
                <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <p className="text-xs text-muted-foreground mb-1">Pinned comment:</p>
                  <p className="text-sm text-foreground">{stream.pinnedComment}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="destinations" className="mt-4 space-y-3">
          {stream.destinations.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No stream destinations configured.
              </CardContent>
            </Card>
          ) : (
            stream.destinations.map((dest) => (
              <Card key={dest.id}>
                <CardContent className="p-4 flex items-center gap-3">
                  <PlatformIcon platform={dest.platform} size="lg" showLabel />
                  <div className="flex-1">
                    {dest.streamTitle && (
                      <p className="text-sm font-medium text-foreground">{dest.streamTitle}</p>
                    )}
                    {dest.rtmpUrl && (
                      <p className="text-xs text-muted-foreground">RTMP: {dest.rtmpUrl}</p>
                    )}
                    {dest.streamKey && (
                      <p className="text-xs text-muted-foreground">
                        Stream Key: {"•".repeat(12)}
                      </p>
                    )}
                  </div>
                  <Badge variant={dest.isEnabled ? "success" : "outline"}>
                    {dest.isEnabled ? "Active" : "Disabled"}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="gear" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Gear Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stream.gearChecklist.length === 0 ? (
                <p className="text-muted-foreground text-sm">No gear checklist added.</p>
              ) : (
                stream.gearChecklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent">
                    <div className="h-4 w-4 rounded border border-border flex items-center justify-center" />
                    <span className="text-sm text-foreground">{item}</span>
                  </div>
                ))
              )}
              {stream.obsNotes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">OBS / Tech notes:</p>
                  <p className="text-sm text-foreground">{stream.obsNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
