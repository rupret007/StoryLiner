import { prisma } from "@/lib/prisma";
import { ContentStudioClient } from "./client";
import { loadGenerationContext } from "@/lib/services/content/campaign-context-server";
import { CAMPAIGN_CONTEXT_UNAVAILABLE, type CampaignContextView } from "@/lib/services/content/campaign-context";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Content Studio" };

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string | string[]; campaignId?: string | string[]; eventId?: string | string[] }>;
}) {
  const query = await searchParams;
  const contextIdentity = JSON.stringify([query.bandId ?? null, query.campaignId ?? null, query.eventId ?? null]);

  const bands = await prisma.band.findMany({
    where: { isActive: true },
    include: {
      voiceProfile: true,
      platformAccounts: { where: { isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const malformed = [query.bandId, query.campaignId, query.eventId].some(
    (value) => value !== undefined && (typeof value !== "string" || !value.trim()),
  );
  const explicitBand = typeof query.bandId === "string" ? query.bandId : undefined;
  const hasLink = query.campaignId !== undefined || query.eventId !== undefined;
  const selectedBand = explicitBand
    ? bands.find((band) => band.id === explicitBand)
    : !hasLink && !malformed ? bands[0] : undefined;
  let linkedContext: CampaignContextView | null = null;
  let contextError: string | null = null;
  if (malformed || (query.bandId !== undefined && !selectedBand) || (hasLink && !explicitBand)) {
    contextError = "This band or campaign link is invalid. Choose a band below to deliberately start an unlinked draft.";
  } else if (selectedBand) {
    try {
      const resolved = await loadGenerationContext({
        bandId: selectedBand.id,
        ...(typeof query.campaignId === "string" ? { campaignId: query.campaignId } : {}),
        ...(typeof query.eventId === "string" ? { eventId: query.eventId } : {}),
      });
      linkedContext = resolved.linked;
    } catch {
      contextError = CAMPAIGN_CONTEXT_UNAVAILABLE;
    }
  }

  return <ContentStudioClient bands={bands} selectedBandId={selectedBand?.id} linkedContext={linkedContext} contextError={contextError} contextIdentity={contextIdentity} />;
}
