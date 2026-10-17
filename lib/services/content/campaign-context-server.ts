import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCampaignContextView, CAMPAIGN_CONTEXT_UNAVAILABLE } from "./campaign-context";

const linksSchema = z.object({
  bandId: z.string().cuid(),
  campaignId: z.string().cuid().optional(),
  eventId: z.string().cuid().optional(),
});

type ContextReader = Pick<Prisma.TransactionClient, "band" | "campaign" | "event">;

/** Same read contract for the Studio preview and the server's pre/post generation checks. */
export async function loadGenerationContext(
  input: { bandId: string; campaignId?: string; eventId?: string },
  db: ContextReader = prisma,
) {
  const parsed = linksSchema.safeParse(input);
  if (!parsed.success) throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
  const { bandId, campaignId, eventId } = parsed.data;
  const band = await db.band.findUnique({ where: { id: bandId }, include: { voiceProfile: true } });
  if (!band || band.id !== bandId || band.isActive !== true) throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
  if (!campaignId && !eventId) return { band, linked: null };
  const campaign = campaignId ? await db.campaign.findUnique({ where: { id: campaignId } }) : null;
  if (campaignId && (!campaign || campaign.id !== campaignId || campaign.bandId !== bandId || campaign.isActive !== true)) {
    throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
  }
  if (campaign && eventId && campaign.eventId !== eventId) throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
  const effectiveEventId = campaign ? campaign.eventId : eventId;
  const event = effectiveEventId ? await db.event.findUnique({ where: { id: effectiveEventId } }) : null;
  if (effectiveEventId && (!event || event.id !== effectiveEventId)) throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
  return { band, linked: buildCampaignContextView({ band, campaign, event }) };
}
