/**
 * Promo review desk after leftover #30.
 *
 * #30 bound Generate → Guard → Review to the seen snapshot and sent Jeff
 * to `/review-queue?focus=`. That leftover is a ring on a card in a pile.
 * This desk is the product: one snapshot, the six-step path, and the
 * facts needed to decide. Nothing on this desk publishes.
 *
 * After #37, linked generation stores saved campaign/event facts on
 * GenerationRun.inputContext. After #39 the desk shows those facts. The
 * leftover is next-action clarity: Dashboard, pile cards, and the decision
 * heading must name the same snapshot and must not skip held work.
 * It must not invent Saturday/8pm or hide voice rules.
 */

import {
  CAMPAIGN_CONTEXT_TIME_ZONE,
  displayCampaignInstant,
  missingCampaignFacts,
  type GenerationContextFacts,
} from "@/lib/services/content/campaign-context";
import { reviewDecisionHeading } from "@/lib/services/publish/review-decision";

export const PROMO_PIPELINE_STEPS = [
  "generate",
  "guard",
  "review",
  "approve",
  "schedule",
  "publish",
] as const;

export type PromoPipelineStep = (typeof PROMO_PIPELINE_STEPS)[number];

export const PROMO_PIPELINE_LABELS: Record<PromoPipelineStep, string> = {
  generate: "Generate",
  guard: "Guard",
  review: "Review",
  approve: "Approve",
  schedule: "Schedule",
  publish: "Publish",
};

export const PROMO_PIPELINE_PATH = PROMO_PIPELINE_STEPS.map(
  (step) => PROMO_PIPELINE_LABELS[step]
).join(" → ");

export const REVIEW_DESK_NO_PUBLISH =
  "Approve, Hold, Deny, and Schedule are labeled on the card. None of them publish.";

export const REVIEW_DESK_MISSING_FOCUS =
  "This snapshot is not on the desk. It may be archived, or the link is stale. Nothing was published.";

export const REVIEW_DESK_QUEUE_STATUSES = [
  "IN_REVIEW",
  "HELD",
  "APPROVED",
  "REJECTED",
] as const;

export const REVIEW_DESK_FOCUS_STATUSES = [
  ...REVIEW_DESK_QUEUE_STATUSES,
  "SCHEDULED",
  "PUBLISHED",
] as const;

const FOCUS_CUID = /^c[a-z0-9]{20,32}$/i;

/** Refuse junk ?focus= values before they hit Prisma or the desk. */
export function parseReviewDeskFocusId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!FOCUS_CUID.test(id)) return null;
  return id;
}

export function reviewDeskAskedForFocus(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

export function reviewDeskFocusMissing(options: {
  askedForFocus: boolean;
  focusedDraftId?: string | null;
}): boolean {
  return options.askedForFocus && !options.focusedDraftId;
}

export function reviewDeskCanDecide(status: string | null | undefined): boolean {
  return status === "IN_REVIEW" || status === "HELD" || status === "APPROVED";
}

export function reviewDeskCanMutateCreative(
  status: string | null | undefined
): boolean {
  return status === "IN_REVIEW" || status === "HELD" || status === "APPROVED";
}

export function reviewDeskCanCopy(status: string | null | undefined): boolean {
  return status !== "SCHEDULED" && status !== "PUBLISHED";
}

export function reviewDeskCanArchive(status: string | null | undefined): boolean {
  return status !== "SCHEDULED" && status !== "PUBLISHED";
}

export function reviewDeskChromeNote(status: string | null | undefined): string {
  switch (status) {
    case "APPROVED":
      return "Schedule is the next yes. It does not publish.";
    case "SCHEDULED":
      return "Publish is the worker when this job is due. This desk has no Publish button.";
    case "PUBLISHED":
      return "The worker already published this. This desk never publishes.";
    case "REJECTED":
      return "Denied. Copy it for another pass. This did not publish.";
    default:
      return "Review this snapshot. Approve / Hold / Deny never publish.";
  }
}

export function reviewDeskScheduleHref(): string {
  return "/scheduled-posts";
}

export type OperatorPolicyRow = {
  label: string;
  value: string;
  locked: true;
};

/** Settings is an operator readout, not a toggle that can enable auto-publish. */
export function operatorPathPolicy(options: {
  llmAdapter: string;
  socialAdapter: string;
}): OperatorPolicyRow[] {
  const llm = options.llmAdapter.trim() || "mock";
  const social = options.socialAdapter.trim() || "mock";

  return [
    { label: "Path", value: PROMO_PIPELINE_PATH, locked: true },
    {
      label: "Approve / Hold / Deny",
      value: "Review only. These never publish.",
      locked: true,
    },
    {
      label: "Schedule",
      value: "A later yes, bound to the approved snapshot. Queues a worker job.",
      locked: true,
    },
    {
      label: "Publish",
      value: "Worker only, after a due job. Never a desk button. Never auto-publish.",
      locked: true,
    },
    {
      label: "Live destinations",
      value: "Facebook, Instagram, and YouTube only. No X adapter.",
      locked: true,
    },
    {
      label: "Real writes",
      value:
        social === "real"
          ? "Real mode. Connected + active Facebook / Instagram / YouTube accounts only."
          : "Mock mode. Seed accounts stay disconnected. Nothing reaches a live page.",
      locked: true,
    },
    {
      label: "LLM",
      value:
        llm === "openai"
          ? "OpenAI — drafts still land in review."
          : "Mock — offline drafts only.",
      locked: true,
    },
  ];
}

export type PromoPipelineState = "done" | "current" | "upcoming" | "off";

export type PromoPipelineStepView = {
  id: PromoPipelineStep;
  label: string;
  state: PromoPipelineState;
  /** Publish is never a button on the review desk. */
  actionable: boolean;
};

export function promoPipelineCurrentStep(
  status: string | null | undefined
): PromoPipelineStep | "off" {
  switch (status) {
    case "DRAFT":
    case "IN_REVIEW":
    case "HELD":
      return "review";
    case "APPROVED":
      return "schedule";
    case "SCHEDULED":
    case "PUBLISHED":
      return "publish";
    default:
      return "off";
  }
}

export function promoPipelineSteps(
  status: string | null | undefined
): PromoPipelineStepView[] {
  const current = promoPipelineCurrentStep(status);
  const currentIndex =
    current === "off" ? -1 : PROMO_PIPELINE_STEPS.indexOf(current);

  return PROMO_PIPELINE_STEPS.map((id, index) => {
    const state: PromoPipelineState =
      current === "off"
        ? "off"
        : index < currentIndex
          ? "done"
          : index === currentIndex
            ? "current"
            : "upcoming";

    return {
      id,
      label: PROMO_PIPELINE_LABELS[id],
      state,
      actionable: id !== "generate" && id !== "guard" && id !== "publish",
    };
  });
}

export function reviewDeskQueueHref(): string {
  return "/review-queue";
}

export function reviewDeskSamePileIds(
  drafts: readonly { id: string; status: string }[],
  focusId: string
): string[] {
  const focused = drafts.find((draft) => draft.id === focusId);
  if (!focused) return [];
  return drafts
    .filter((draft) => draft.status === focused.status)
    .map((draft) => draft.id);
}

export function reviewDeskNeighbors(
  pileIds: readonly string[],
  focusId: string
): {
  previousId: string | null;
  nextId: string | null;
  position: number;
  total: number;
} {
  const index = pileIds.indexOf(focusId);
  if (index < 0) {
    return { previousId: null, nextId: null, position: 0, total: pileIds.length };
  }

  return {
    previousId: pileIds[index - 1] ?? null,
    nextId: pileIds[index + 1] ?? null,
    position: index + 1,
    total: pileIds.length,
  };
}

const IMAGE_PATH = /\.(avif|gif|jpe?g|png|webp)$/i;

export function previewablePromoMediaUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!IMAGE_PATH.test(parsed.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

export type ReviewGenerationOrigin =
  | "saved-campaign-event"
  | "operator-supplied"
  | "unknown";

export type ReviewGenerationContextFacts = {
  origin: ReviewGenerationOrigin;
  campaignName: string | null;
  campaignDescription: string | null;
  campaignTargetDate: string | null;
  eventDetails: string | null;
  showDate: string | null;
  venue: string | null;
  city: string | null;
  doorsTime: string | null;
  setTime: string | null;
  ticketUrl: string | null;
  additionalContext: string | null;
  displayTimeZone: string | null;
  missingFacts: string[];
};

const EMPTY_GENERATION_FACTS: ReviewGenerationContextFacts = {
  origin: "unknown",
  campaignName: null,
  campaignDescription: null,
  campaignTargetDate: null,
  eventDetails: null,
  showDate: null,
  venue: null,
  city: null,
  doorsTime: null,
  setTime: null,
  ticketUrl: null,
  additionalContext: null,
  displayTimeZone: null,
  missingFacts: [],
};

function readContextText(ctx: Record<string, unknown>, key: string): string | null {
  const value = ctx[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPublicTicketUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function readSourceRecord(ctx: Record<string, unknown>): Record<string, unknown> | null {
  const source = ctx.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  return source as Record<string, unknown>;
}

function readStoredMissingFacts(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const facts = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return facts.length > 0 ? facts : [];
}

export function generationContextFacts(
  inputContext: unknown
): ReviewGenerationContextFacts {
  if (!inputContext || typeof inputContext !== "object" || Array.isArray(inputContext)) {
    return { ...EMPTY_GENERATION_FACTS };
  }

  const ctx = inputContext as Record<string, unknown>;
  const source = readSourceRecord(ctx);
  const kind = source && typeof source.kind === "string" ? source.kind : null;
  const origin: ReviewGenerationOrigin =
    kind === "saved-campaign-event"
      ? "saved-campaign-event"
      : kind === "operator-supplied"
        ? "operator-supplied"
        : "unknown";
  const eventId =
    source && typeof source.eventId === "string" && source.eventId.trim()
      ? source.eventId.trim()
      : null;
  const displayTimeZone =
    source && typeof source.displayTimeZone === "string" && source.displayTimeZone.trim()
      ? source.displayTimeZone.trim()
      : origin === "saved-campaign-event"
        ? CAMPAIGN_CONTEXT_TIME_ZONE
        : null;

  const facts: ReviewGenerationContextFacts = {
    origin,
    campaignName: readContextText(ctx, "campaignName"),
    campaignDescription: readContextText(ctx, "campaignDescription"),
    campaignTargetDate: readContextText(ctx, "campaignTargetDate"),
    eventDetails: readContextText(ctx, "eventDetails"),
    showDate: readContextText(ctx, "showDate"),
    venue: readContextText(ctx, "venue"),
    city: readContextText(ctx, "city"),
    doorsTime: readContextText(ctx, "doorsTime"),
    setTime: readContextText(ctx, "setTime"),
    ticketUrl: readPublicTicketUrl(readContextText(ctx, "ticketUrl")),
    additionalContext: readContextText(ctx, "additionalContext"),
    displayTimeZone,
    missingFacts: [],
  };

  const storedMissing = readStoredMissingFacts(ctx.missingFacts);
  facts.missingFacts =
    storedMissing ??
    (origin === "saved-campaign-event"
      ? missingCampaignFacts(facts as GenerationContextFacts, Boolean(eventId))
      : []);

  return facts;
}

export const REVIEW_DESK_SAVED_FACTS_NOTE =
  "These are the saved campaign/event facts from generation. Missing facts were not invented. Dates use America/Chicago, not a per-event timezone. This desk does not publish.";

export const REVIEW_DESK_UNLINKED_FACTS_NOTE =
  "Unlinked draft — facts below were supplied at generate, not a saved campaign. This desk does not publish.";

export function reviewDeskFactsNote(inputContext: unknown): string | null {
  const origin = generationContextFacts(inputContext).origin;
  if (origin === "saved-campaign-event") return REVIEW_DESK_SAVED_FACTS_NOTE;
  if (origin === "operator-supplied") return REVIEW_DESK_UNLINKED_FACTS_NOTE;
  return null;
}

export type ReviewDeskSnapshotCue = {
  origin: Exclude<ReviewGenerationOrigin, "unknown">;
  headline: string;
  missingCount: number;
  missingLabel: string | null;
  line: string;
};

function missingFactsCueLabel(missingFacts: readonly string[]): string | null {
  if (missingFacts.length === 0) return null;
  if (missingFacts.some((fact) => /no event linked/i.test(fact))) {
    return "No event linked";
  }
  const count = missingFacts.length;
  return `${count} fact${count === 1 ? "" : "s"} not saved`;
}

/**
 * One-line generation snapshot for Dashboard rows, queue pile cards, and
 * next-action copy. Provenance comes from the generation receipt only.
 * Ticket URLs and clock times stay off this line so the cue cannot invent
 * Saturday/8pm or echo a refused link.
 */
export function reviewDeskSnapshotCue(draft: {
  campaign?: { name?: string | null } | null;
  generationRun?: { inputContext?: unknown } | null;
}): ReviewDeskSnapshotCue | null {
  const context = generationContextFacts(draft.generationRun?.inputContext);
  const campaignName = draft.campaign?.name?.trim() || context.campaignName;

  if (context.origin === "saved-campaign-event") {
    const headline =
      campaignName || context.eventDetails || "Saved campaign";
    const missingLabel = missingFactsCueLabel(context.missingFacts);
    return {
      origin: "saved-campaign-event",
      headline,
      missingCount: context.missingFacts.length,
      missingLabel,
      line: ["Saved campaign", headline !== "Saved campaign" ? headline : null, missingLabel]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (context.origin === "operator-supplied") {
    const headline = campaignName || context.venue || "Unlinked draft";
    return {
      origin: "operator-supplied",
      headline,
      missingCount: 0,
      missingLabel: null,
      line:
        headline === "Unlinked draft"
          ? "Unlinked draft"
          : `Unlinked draft · ${headline}`,
    };
  }

  return null;
}

/** Status next-yes plus an honest check of the generation snapshot. */
export function reviewDeskNextAction(options: {
  status: string;
  inputContext?: unknown;
  campaign?: { name?: string | null } | null;
}): string {
  const cue = reviewDeskSnapshotCue({
    campaign: options.campaign,
    generationRun:
      options.inputContext === undefined
        ? undefined
        : { inputContext: options.inputContext },
  });
  if (!cue) return reviewDecisionHeading(options.status);

  const saved = cue.origin === "saved-campaign-event";
  const missing = cue.missingLabel;

  switch (options.status) {
    case "IN_REVIEW":
      if (saved && missing) {
        return `Check saved campaign facts (${missing}), then Approve, Hold, or Deny. None of those publish.`;
      }
      if (saved) {
        return "Check saved campaign facts, then Approve, Hold, or Deny. None of those publish.";
      }
      return "Check the unlinked generate facts, then Approve, Hold, or Deny. None of those publish.";
    case "HELD":
      return saved
        ? "Check saved campaign facts, then Approve or return to review. Hold is not publish."
        : "Check the unlinked generate facts, then Approve or return to review. Hold is not publish.";
    case "APPROVED":
      return saved
        ? "Saved campaign facts stay with this snapshot. Schedule is the next yes. It does not publish."
        : "These generate facts stay with this snapshot. Schedule is the next yes. It does not publish.";
    default:
      return reviewDecisionHeading(options.status);
  }
}

export type ReviewDeskFact = { label: string; value: string };

export function reviewDeskFactRows(draft: {
  ctaText?: string | null;
  altText?: string | null;
  confidenceNotes?: string | null;
  campaign?: { name: string; type: string } | null;
  generationRun?: { campaignType: string; inputContext: unknown } | null;
  scheduledPost?: {
    scheduledFor?: Date | string | null;
    platformAccount?: { handle?: string | null; isConnected?: boolean } | null;
    job?: { status?: string | null } | null;
  } | null;
  band?: {
    voiceProfile?: {
      toneRules?: readonly string[] | null;
      bannedPhrases?: readonly string[] | null;
    } | null;
  } | null;
}): ReviewDeskFact[] {
  const rows: ReviewDeskFact[] = [];
  const campaignType =
    draft.campaign?.type ?? draft.generationRun?.campaignType ?? null;
  const context = generationContextFacts(draft.generationRun?.inputContext);

  if (context.origin === "saved-campaign-event") {
    rows.push({ label: "Origin", value: "Saved campaign" });
  } else if (context.origin === "operator-supplied") {
    rows.push({ label: "Origin", value: "Unlinked draft" });
  }

  const campaignName = draft.campaign?.name?.trim() || context.campaignName;
  if (campaignName) {
    rows.push({ label: "Campaign", value: campaignName });
  }
  if (campaignType) {
    rows.push({
      label: "Type",
      value: campaignType
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    });
  }
  if (context.campaignDescription) {
    rows.push({ label: "Campaign brief", value: context.campaignDescription });
  }
  if (context.campaignTargetDate) {
    rows.push({ label: "Campaign target date", value: context.campaignTargetDate });
  }
  if (context.eventDetails) {
    rows.push({ label: "Event", value: context.eventDetails });
  }
  if (context.showDate) rows.push({ label: "Show date", value: context.showDate });
  if (context.venue) rows.push({ label: "Venue", value: context.venue });
  if (context.city) rows.push({ label: "City", value: context.city });
  if (context.doorsTime) rows.push({ label: "Doors", value: context.doorsTime });
  if (context.setTime) rows.push({ label: "Set time", value: context.setTime });
  if (context.ticketUrl) {
    rows.push({ label: "Ticket URL", value: context.ticketUrl });
  }
  if (context.additionalContext) {
    rows.push({
      label: "Operator note",
      value: context.additionalContext,
    });
  }
  if (context.missingFacts.length > 0) {
    rows.push({ label: "Not saved", value: context.missingFacts.join(" · ") });
  }
  if (draft.ctaText?.trim()) {
    rows.push({ label: "CTA", value: draft.ctaText.trim() });
  }
  if (draft.altText?.trim()) {
    rows.push({ label: "Alt text", value: draft.altText.trim() });
  }
  if (draft.confidenceNotes?.trim()) {
    rows.push({ label: "Why this draft", value: draft.confidenceNotes.trim() });
  }

  const scheduledFor = draft.scheduledPost?.scheduledFor;
  if (scheduledFor) {
    const when =
      typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
    if (!Number.isNaN(when.getTime())) {
      rows.push({
        label: "Scheduled for",
        value: displayCampaignInstant(when),
      });
    }
  }
  const handle = draft.scheduledPost?.platformAccount?.handle?.trim();
  if (handle) {
    const mock = draft.scheduledPost?.platformAccount?.isConnected
      ? ""
      : " (mock)";
    rows.push({ label: "Account", value: `@${handle}${mock}` });
  }
  const jobStatus = draft.scheduledPost?.job?.status?.trim();
  if (jobStatus) {
    rows.push({ label: "Worker job", value: jobStatus });
  }

  const voiceRules = (draft.band?.voiceProfile?.toneRules ?? [])
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (voiceRules.length > 0) {
    rows.push({ label: "Voice", value: voiceRules.join(" · ") });
  }

  const banned = (draft.band?.voiceProfile?.bannedPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  if (banned.length > 0) {
    rows.push({ label: "Never say", value: banned.join(" · ") });
  }

  return rows;
}

export function reviewDeskPlatformNote(platform: string): string | null {
  switch (platform) {
    case "FACEBOOK":
      return "Facebook is a live destination. Approve and Schedule still do not publish.";
    case "INSTAGRAM":
      return "Instagram is a live destination and needs a public https image or video.";
    case "YOUTUBE":
      return "YouTube is a live destination. Text posts stay manual. Description updates stay opt-in.";
    case "TWITTER":
      return "Twitter/X is schema leftover. StoryLiner will refuse this schedule. No tweet will go out.";
    case "TIKTOK":
    case "BLUESKY":
    case "TWITCH":
      return `${platform} is not a live destination. Real mode will refuse this schedule.`;
    default:
      return null;
  }
}

export function reviewDeskDoesNotPublish(): false {
  return false;
}
