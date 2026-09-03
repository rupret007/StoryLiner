/**
 * Promo review desk after leftover #30.
 *
 * #30 bound Generate → Guard → Review to the seen snapshot and sent Jeff
 * to `/review-queue?focus=`. That leftover is a ring on a card in a pile.
 * This desk is the product: one snapshot, the six-step path, and the
 * facts needed to decide. Nothing on this desk publishes.
 */

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
  "This desk is review only. Approve, Hold, and Deny never publish. Schedule is a later yes.";

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

export function generationContextFacts(inputContext: unknown): {
  venue: string | null;
  city: string | null;
  showDate: string | null;
} {
  if (!inputContext || typeof inputContext !== "object" || Array.isArray(inputContext)) {
    return { venue: null, city: null, showDate: null };
  }

  const ctx = inputContext as Record<string, unknown>;
  const read = (key: string) => {
    const value = ctx[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return {
    venue: read("venue"),
    city: read("city"),
    showDate: read("showDate"),
  };
}

export type ReviewDeskFact = { label: string; value: string };

export function reviewDeskFactRows(draft: {
  ctaText?: string | null;
  altText?: string | null;
  confidenceNotes?: string | null;
  campaign?: { name: string; type: string } | null;
  generationRun?: { campaignType: string; inputContext: unknown } | null;
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

  if (draft.campaign?.name) {
    rows.push({ label: "Campaign", value: draft.campaign.name });
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
  if (context.venue) rows.push({ label: "Venue", value: context.venue });
  if (context.city) rows.push({ label: "City", value: context.city });
  if (context.showDate) rows.push({ label: "Show date", value: context.showDate });
  if (draft.ctaText?.trim()) {
    rows.push({ label: "CTA", value: draft.ctaText.trim() });
  }
  if (draft.altText?.trim()) {
    rows.push({ label: "Alt text", value: draft.altText.trim() });
  }
  if (draft.confidenceNotes?.trim()) {
    rows.push({ label: "Why this draft", value: draft.confidenceNotes.trim() });
  }

  const voiceRules = (draft.band?.voiceProfile?.toneRules ?? [])
    .map((rule) => rule.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (voiceRules.length > 0) {
    rows.push({ label: "Voice", value: voiceRules.join(" · ") });
  }

  const banned = (draft.band?.voiceProfile?.bannedPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, 6);
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
