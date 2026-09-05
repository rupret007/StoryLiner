import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { campaignTypeLabel } from "@/lib/utils";
import { buildCampaignContextView } from "@/lib/services/content/campaign-context";
import { campaignStudioHref, standaloneStudioHref } from "@/lib/services/content/campaign-navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Campaign Builder" };
export const dynamic = "force-dynamic";

export default async function CampaignBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string | string[] }>;
}) {
  const { bandId: requestedBandId } = await searchParams;
  const bands = await prisma.band.findMany({ where: { isActive: true } });
  const bandId = typeof requestedBandId === "string" ? requestedBandId : undefined;
  if (requestedBandId !== undefined && (!bandId || !bands.some((band) => band.id === bandId))) {
    return <EmptyState icon={Megaphone} title="Band unavailable"
      description="This link does not select an active band. Choose a band before planning a draft."
      action={<Button asChild><Link href="/campaign-builder">Choose a band</Link></Button>} />;
  }

  const campaigns = await prisma.campaign.findMany({
    where: bandId ? { bandId } : {},
    include: {
      band: true,
      event: true,
      _count: { select: { drafts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Button size="sm" asChild>
          <Link href={standaloneStudioHref(bandId)}>
            <Plus className="h-4 w-4" />
            Create a standalone draft
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Choose a saved campaign to carry its band, content type, and event details into Content Studio. Every draft returns to review; nothing publishes here.</p>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Saved campaigns group content by show, release, or theme. You can create a standalone draft now without inventing a campaign."
          action={<Button asChild><Link href={standaloneStudioHref(bandId)}>Create a standalone draft</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => {
            let available = false;
            try {
              buildCampaignContextView({ band: campaign.band, campaign, event: campaign.event });
              available = true;
            } catch {
              // Do not show a mismatched event as this campaign's saved facts.
            }
            return <Card key={campaign.id} className="min-w-0 hover:border-primary/40 transition-all">
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
                {available && campaign.event && (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground">{campaign.event.title}</span>
                    {campaign.event.venue && ` at ${campaign.event.venue}`}
                    {` — ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric" }).format(campaign.event.eventDate)} (America/Chicago)`}
                  </div>
                )}
                {!available && <p className="text-xs text-amber-300" role="status">Unavailable for generation: the saved campaign or event is inactive, cancelled, or inconsistent.</p>}
                <div className="flex flex-wrap gap-2 items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {campaign._count.drafts} draft{campaign._count.drafts !== 1 ? "s" : ""}
                  </span>
                  {available && <Button size="sm" variant="ghost" asChild>
                    <Link href={campaignStudioHref(campaign.bandId, campaign.id)}>
                      Generate content
                    </Link>
                  </Button>}
                </div>
              </CardContent>
            </Card>;
          })}
        </div>
      )}
    </div>
  );
}
