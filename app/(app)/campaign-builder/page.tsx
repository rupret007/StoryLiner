import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, campaignTypeLabel } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Campaign Builder" };
export const dynamic = "force-dynamic";

export default async function CampaignBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string }>;
}) {
  const { bandId } = await searchParams;

  const [bands, campaigns] = await Promise.all([
    prisma.band.findMany({ where: { isActive: true } }),
    prisma.campaign.findMany({
      where: bandId ? { bandId } : {},
      include: {
        band: true,
        event: true,
        _count: { select: { drafts: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!bandId ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href="/campaign-builder">All Bands</Link>
          </Button>
          {bands.map((band) => (
            <Button
              key={band.id}
              variant={bandId === band.id ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={`/campaign-builder?bandId=${band.id}`}>
                {band.name}
              </Link>
            </Button>
          ))}
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Campaigns group your content by show, release, or theme. Create one to start planning posts."
          action={<Button>New Campaign</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="hover:border-primary/40 transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">
                    {campaign.name}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {campaignTypeLabel(campaign.type)}
                  </Badge>
                </div>
                <BandChip name={campaign.band.name} color={campaign.band.coverColor} />
              </CardHeader>
              <CardContent className="space-y-2">
                {campaign.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {campaign.description}
                  </p>
                )}
                {campaign.event && (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground">{campaign.event.title}</span>
                    {campaign.event.venue && ` at ${campaign.event.venue}`}
                    {campaign.event.eventDate && ` — ${formatDate(campaign.event.eventDate)}`}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {campaign._count.drafts} draft{campaign._count.drafts !== 1 ? "s" : ""}
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/content-studio?bandId=${campaign.bandId}&campaignId=${campaign.id}`}>
                      Generate content
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
