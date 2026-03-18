import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/storyliner/status-badge";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { formatRelative, platformLabel } from "@/lib/utils";
import { Pen, Megaphone, Radio, Settings, Calendar, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ bandId: string }> }): Promise<Metadata> {
  const { bandId } = await params;
  const band = await prisma.band.findUnique({ where: { id: bandId } });
  return { title: band?.name ?? "Band" };
}

export default async function BandDetailPage({ params }: { params: Promise<{ bandId: string }> }) {
  const { bandId } = await params;

  const band = await prisma.band.findUnique({
    where: { id: bandId },
    include: {
      voiceProfile: true,
      knowledgeEntries: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
      platformAccounts: true,
      events: { orderBy: { eventDate: "asc" }, take: 5 },
      drafts: {
        where: { status: "IN_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: {
        select: {
          drafts: true,
          publishedPosts: true,
          events: true,
          livestreamEvents: true,
        },
      },
    },
  });

  if (!band) notFound();

  const vp = band.voiceProfile;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/bands">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div
          className="h-16 w-16 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0"
          style={{ backgroundColor: band.coverColor }}
        >
          {band.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground">{band.name}</h2>
          <div className="flex flex-wrap gap-2 mt-1">
            {band.genre && <Badge variant="secondary">{band.genre}</Badge>}
            {band.location && <Badge variant="outline">{band.location}</Badge>}
            {band.founded && <Badge variant="outline">Est. {band.founded}</Badge>}
          </div>
          {band.description && (
            <p className="text-sm text-muted-foreground mt-2">{band.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/content-studio?bandId=${band.id}`}>
              <Pen className="h-4 w-4" />
              Generate Content
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/campaign-builder?bandId=${band.id}`}>
              <Megaphone className="h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Drafts", value: band._count.drafts },
          { label: "Published", value: band._count.publishedPosts },
          { label: "Events", value: band._count.events },
          { label: "Streams", value: band._count.livestreamEvents },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="voice">
        <TabsList>
          <TabsTrigger value="voice">Voice Profile</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="review">In Review ({band.drafts.length})</TabsTrigger>
        </TabsList>

        {/* Voice Profile */}
        <TabsContent value="voice" className="mt-4">
          {!vp ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No voice profile configured.</p>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  The voice profile defines tone, banned phrases, humor level, and platform-specific rules that keep content sounding like {band.name} — not a generic brand.
                </p>
                <Button>Configure Voice Profile</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Voice Description</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground">{vp.toneDescription}</p>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Personality traits</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vp.personalityTraits.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  {vp.audienceNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Audience notes</p>
                      <p className="text-sm text-foreground">{vp.audienceNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Settings</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Humor", value: vp.humorLevel },
                      { label: "Edge", value: vp.edgeLevel },
                      { label: "Emoji", value: vp.emojiTolerance },
                    ].map((s) => (
                      <div key={s.label} className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-xl font-bold text-foreground">{s.value}/10</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Explicit content</span>
                    <Badge variant={vp.isExplicitOk ? "secondary" : "outline"}>
                      {vp.isExplicitOk ? "Allowed" : "Clean only"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Default tone</span>
                    <Badge variant="secondary">{vp.defaultTone}</Badge>
                  </div>
                </CardContent>
              </Card>

              {(vp.bannedPhrases.length > 0 || vp.toneRules.length > 0) && (
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-sm">Rules and Guardrails</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {vp.toneRules.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Tone rules</p>
                        <ul className="space-y-1">
                          {vp.toneRules.map((rule, i) => (
                            <li key={i} className="text-sm text-foreground flex gap-2">
                              <span className="text-primary mt-0.5">—</span>
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {vp.bannedPhrases.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Banned phrases</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vp.bannedPhrases.map((phrase) => (
                            <Badge key={phrase} variant="destructive" className="text-xs">{phrase}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Platforms */}
        <TabsContent value="platforms" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {band.platformAccounts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No platform accounts configured. Add them in{" "}
                  <Link href="/integrations" className="text-primary hover:underline">
                    Integrations
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {band.platformAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border"
                    >
                      <PlatformIcon platform={account.platform} size="md" showLabel />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">@{account.handle}</p>
                      </div>
                      <Badge
                        variant={account.isConnected ? "success" : "outline"}
                        className="text-xs shrink-0"
                      >
                        {account.isConnected ? "Connected" : "Mock"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge */}
        <TabsContent value="knowledge" className="mt-4">
          <div className="space-y-3">
            {band.knowledgeEntries.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No knowledge entries yet. These help inform AI generation with band-specific context.
                </CardContent>
              </Card>
            ) : (
              band.knowledgeEntries.map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm text-foreground">{entry.title}</p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {entry.type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.content}</p>
                    {entry.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* In Review */}
        <TabsContent value="review" className="mt-4">
          <div className="space-y-3">
            {band.drafts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No drafts in review for {band.name}.
                </CardContent>
              </Card>
            ) : (
              band.drafts.map((draft) => (
                <Card key={draft.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <PlatformIcon platform={draft.platform} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{draft.caption}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <StatusBadge status={draft.status} />
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(draft.createdAt)}
                          </span>
                          {draft.brandFitScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              Fit: {draft.brandFitScore}/100
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {band.drafts.length > 0 && (
              <div className="text-center pt-2">
                <Button variant="outline" asChild>
                  <Link href="/review-queue">Open Review Queue</Link>
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
