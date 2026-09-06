import type { Campaign, CampaignType, Draft, Event } from "@prisma/client";

/** Display convention for this single-operator app, not an Event timezone claim. */
export const CAMPAIGN_CONTEXT_TIME_ZONE = "America/Chicago";
export const CAMPAIGN_CONTEXT_UNAVAILABLE =
  "The selected campaign or event is unavailable for this active band. Return to Campaign Builder and choose an available campaign, or deliberately start without a link.";
export const CAMPAIGN_CONTEXT_CHANGED =
  "The saved campaign, event, or band changed. Reload and review the current facts before generating again. Nothing was saved.";
export const CAMPAIGN_CONTEXT_OFFLINE_ONLY =
  "Linked campaign generation is available in offline mock mode only. No campaign or event data was sent to a provider. Exporting saved context requires separate privacy approval.";
export const CAMPAIGN_CONTEXT_TYPE_MISMATCH =
  "The content type must match the saved campaign. Reload its facts or deliberately start an unlinked draft.";

export type StudioGenerationBlockedCode = "context_changed" | "context_unavailable" |
  "offline_only" | "invalid_input" | "type_mismatch";
export type StudioGenerationResult =
  | { status: "saved"; draft: Draft }
  | { status: "blocked"; code: StudioGenerationBlockedCode }
  | { status: "unconfirmed" };

export type GenerationContextFacts = {
  eventDetails?: string;
  showDate?: string;
  venue?: string;
  city?: string;
  ticketUrl?: string;
  doorsTime?: string;
  setTime?: string;
  campaignName?: string;
  campaignDescription?: string;
  campaignTargetDate?: string;
  additionalContext?: string;
};

export type CampaignContextView = {
  bandId: string;
  bandName: string;
  campaignId: string | null;
  eventId: string | null;
  campaignType: CampaignType | null;
  campaignName: string | null;
  campaignDescription: string | null;
  eventTitle: string | null;
  facts: GenerationContextFacts;
  receipt: string;
  missingFacts: string[];
};

export type CampaignContextSource = {
  band: {
    id: string;
    name: string;
    isActive: boolean;
    updatedAt: Date | string;
    voiceProfile?: { updatedAt: Date | string } | null;
  };
  campaign: Pick<Campaign, "id" | "bandId" | "eventId" | "type" | "name" |
    "description" | "targetDate" | "isActive" | "updatedAt"> | null;
  event: Pick<Event, "id" | "bandId" | "title" | "venue" | "city" |
    "eventDate" | "doorsTime" | "setTime" | "ticketUrl" | "isCancelled" | "updatedAt"> | null;
};

function unavailable(): never {
  throw new Error(CAMPAIGN_CONTEXT_UNAVAILABLE);
}

function text(value: unknown, max: number, multiline = false): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max ||
      (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    return unavailable();
  }
  return value.trim() || null;
}

function instant(value: unknown): string {
  if (!(value instanceof Date) && (typeof value !== "string" ||
      value.trim() !== value ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))) {
    return unavailable();
  }
  const date = new Date(value as string | Date);
  if (!Number.isFinite(date.getTime())) return unavailable();
  return date.toISOString();
}

function publicTicket(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return unavailable();
  } catch {
    return unavailable();
  }
  return raw;
}

/** Central display for a saved instant. Not a per-event timezone claim. */
export function displayCampaignInstant(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid instant");
  }
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPAIGN_CONTEXT_TIME_ZONE,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date)} (${CAMPAIGN_CONTEXT_TIME_ZONE})`;
}

/** Honest missing-fact labels. Absent fields stay absent — no invented Saturday/8pm. */
export function missingCampaignFacts(
  facts: Pick<GenerationContextFacts, "venue" | "city" | "doorsTime" | "setTime" | "ticketUrl">,
  hasEvent: boolean,
): string[] {
  if (!hasEvent) {
    return ["No event linked — event dates, venue, and times are not supplied"];
  }
  return [
    ...(!facts.venue ? ["Venue not saved"] : []),
    ...(!facts.city ? ["City not saved"] : []),
    ...(!facts.doorsTime ? ["Doors time not saved"] : []),
    ...(!facts.setTime ? ["Set time not saved"] : []),
    ...(!facts.ticketUrl ? ["Ticket link not saved"] : []),
  ];
}

/** Pure shared projection. Throws instead of presenting an unusable linked campaign. */
export function buildCampaignContextView(source: CampaignContextSource): CampaignContextView {
  const { band, campaign, event } = source;
  if (!band || band.isActive !== true || (!campaign && !event) ||
      (campaign && (campaign.bandId !== band.id || campaign.isActive !== true ||
        campaign.eventId !== (event?.id ?? null))) ||
      (event && (event.bandId !== band.id || event.isCancelled !== false))) {
    return unavailable();
  }
  const bandId = text(band.id, 128);
  const bandName = text(band.name, 200);
  const campaignName = text(campaign?.name, 300);
  const campaignDescription = text(campaign?.description, 2000, true);
  const eventTitle = text(event?.title, 300);
  if (!bandId || !bandName || (campaign && !campaignName) || (event && !eventTitle)) return unavailable();
  const eventDate = event ? instant(event.eventDate) : null;
  const campaignTargetDate = campaign?.targetDate == null ? null : instant(campaign.targetDate);
  const doorsTime = event?.doorsTime == null ? null : instant(event.doorsTime);
  const setTime = event?.setTime == null ? null : instant(event.setTime);
  const venue = text(event?.venue, 300);
  const city = text(event?.city, 300);
  const ticketUrl = publicTicket(event?.ticketUrl);
  const facts: GenerationContextFacts = {
    ...(campaignName ? { campaignName } : {}),
    ...(campaignDescription ? { campaignDescription } : {}),
    ...(campaignTargetDate ? { campaignTargetDate: displayCampaignInstant(campaignTargetDate) } : {}),
    ...(eventTitle ? { eventDetails: eventTitle } : {}),
    ...(eventDate ? { showDate: displayCampaignInstant(eventDate) } : {}),
    ...(doorsTime ? { doorsTime: displayCampaignInstant(doorsTime) } : {}),
    ...(setTime ? { setTime: displayCampaignInstant(setTime) } : {}),
    ...(venue ? { venue } : {}),
    ...(city ? { city } : {}),
    ...(ticketUrl ? { ticketUrl } : {}),
  };
  // Fixed-order, bounded JSON: a review receipt, not a credential or authorization token.
  const receipt = JSON.stringify([
    "storyliner-campaign-context-v1", CAMPAIGN_CONTEXT_TIME_ZONE,
    bandId, bandName, instant(band.updatedAt),
    band.voiceProfile ? instant(band.voiceProfile.updatedAt) : null,
    campaign ? [campaign.id, campaign.bandId, campaign.eventId, campaign.type,
      campaignName, campaignDescription, campaignTargetDate,
      instant(campaign.updatedAt)] : null,
    event ? [event.id, event.bandId, eventTitle, eventDate, doorsTime, setTime,
      venue, city, ticketUrl, instant(event.updatedAt)] : null,
  ]);
  if (receipt.length > 20000) return unavailable();
  return {
    bandId, bandName, campaignId: campaign?.id ?? null, eventId: event?.id ?? null,
    campaignType: campaign?.type ?? null, campaignName, campaignDescription,
    eventTitle, facts, receipt,
    missingFacts: missingCampaignFacts(facts, Boolean(event)),
  };
}

/** Shared adapter projection; absent saved fields are explicitly not invented. */
export function generationContextLines(context: GenerationContextFacts): string[] {
  return [
    context.campaignName && `Campaign: ${context.campaignName}`,
    context.campaignDescription && `Campaign brief: ${context.campaignDescription}`,
    context.campaignTargetDate && `Campaign target date: ${context.campaignTargetDate}`,
    context.eventDetails && `Event: ${context.eventDetails}`,
    context.showDate && `Show date: ${context.showDate}`,
    context.venue && `Venue: ${context.venue}`,
    context.city && `City: ${context.city}`,
    context.doorsTime && `Doors: ${context.doorsTime}`,
    context.setTime && `Set time: ${context.setTime}`,
    context.ticketUrl && `Ticket URL: ${context.ticketUrl}`,
    context.additionalContext && `Operator note (not a replacement for saved facts): ${context.additionalContext}`,
  ].filter((line): line is string => typeof line === "string" && line.length > 0);
}
