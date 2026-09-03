/**
 * Generate → Guard → Review snapshot identity.
 *
 * Approve is already bound to Draft.updatedAt (#29). That is not enough
 * by itself: a card can carry a current clock while showing older caption
 * or media, and Generate / rewrite / edit can create new creative the
 * reviewer has not looked at. Review decisions and creative mutations
 * therefore also carry the exact caption / media / guard fingerprint the
 * card displayed. A mismatch refuses the write. Nothing is scheduled or
 * published.
 */

export const REVIEW_SNAPSHOT_INVALID =
  "Review needs the current card. Refresh and look at the caption and media again. " +
  "Nothing was scheduled or published.";

export const REVIEW_SNAPSHOT_STALE =
  "This draft changed since this card loaded. Refresh and review the current caption and media, " +
  "then decide again. Nothing was scheduled or published.";

export const REVIEW_SNAPSHOT_RACE =
  "This draft changed while that decision was being saved. Refresh and review the current caption and media. " +
  "Nothing was scheduled or published.";

export const APPROVE_SNAPSHOT_INVALID =
  "Approval needs the current review card. Refresh and review the caption and media again. " +
  "Nothing was scheduled or published.";

export const APPROVE_SNAPSHOT_STALE =
  "This draft changed since this review card loaded. Refresh and review the current caption and media, " +
  "then approve again. Nothing was scheduled or published.";

export const APPROVE_SNAPSHOT_RACE =
  "This draft changed while approval was being saved. Refresh and review the current caption and media, " +
  "then approve again. Nothing was scheduled or published.";

export type ReviewCreativeIdentity = {
  caption: string;
  hashtags: readonly string[];
  mediaUrls: readonly string[];
  riskLevel: string;
  riskFlags: readonly string[];
  currentVersion: number;
};

export type ReviewSnapshotReceipt = {
  updatedAt: string;
  fingerprint: string;
};

export function reviewCreativeFingerprint(
  draft: ReviewCreativeIdentity
): string {
  return JSON.stringify({
    v: draft.currentVersion,
    r: draft.riskLevel,
    c: draft.caption,
    h: [...draft.hashtags],
    m: [...draft.mediaUrls],
    f: [...draft.riskFlags],
  });
}

export function reviewSnapshotTimestamp(value: Date | string): string {
  return (typeof value === "string" ? new Date(value) : value).toISOString();
}

export function reviewSnapshotReceipt(
  draft: ReviewCreativeIdentity & { updatedAt: Date | string }
): ReviewSnapshotReceipt {
  return {
    updatedAt: reviewSnapshotTimestamp(draft.updatedAt),
    fingerprint: reviewCreativeFingerprint(draft),
  };
}

export function parseReviewSnapshotReceipt(
  receipt: ReviewSnapshotReceipt | string | null | undefined,
  kind: "approve" | "review" = "review"
): { updatedAt: Date; fingerprint: string } {
  const invalid =
    kind === "approve" ? APPROVE_SNAPSHOT_INVALID : REVIEW_SNAPSHOT_INVALID;

  if (!receipt || typeof receipt === "string") {
    throw new Error(invalid);
  }

  const updatedAt = new Date(receipt.updatedAt);
  if (
    !receipt.updatedAt ||
    Number.isNaN(updatedAt.getTime()) ||
    !receipt.fingerprint
  ) {
    throw new Error(invalid);
  }

  return { updatedAt, fingerprint: receipt.fingerprint };
}

export function assertReviewSnapshotMatches(
  draft: ReviewCreativeIdentity & { updatedAt: Date },
  receipt: { updatedAt: Date; fingerprint: string },
  kind: "approve" | "review" = "review"
): void {
  const stale =
    kind === "approve" ? APPROVE_SNAPSHOT_STALE : REVIEW_SNAPSHOT_STALE;

  if (draft.updatedAt.getTime() !== receipt.updatedAt.getTime()) {
    throw new Error(stale);
  }

  if (reviewCreativeFingerprint(draft) !== receipt.fingerprint) {
    throw new Error(stale);
  }
}

export function reviewSnapshotWhere(
  draftId: string,
  status: string,
  updatedAt: Date
) {
  return {
    id: draftId,
    status,
    updatedAt,
  };
}

export function generateSuccessHandoff(options: {
  riskLevel: string;
  riskFlagCount: number;
}): { toast: string; nextAction: string; guardSummary: string } {
  const flagged = options.riskFlagCount > 0;
  return {
    toast:
      "Draft is in Needs Review. Guard ran. Next: review this snapshot. Nothing was published.",
    nextAction:
      "Open this snapshot in the review queue. Approve, Hold, or Deny are next. None of them publish.",
    guardSummary: flagged
      ? `Guard flagged this snapshot (${options.riskLevel}). Review the flags before you decide. This did not publish.`
      : "Guard passed. This snapshot still needs your review yes. This did not publish.",
  };
}

export function reviewGuardBanner(options: {
  riskLevel: string;
  riskFlags: readonly string[];
}): { tone: "pass" | "flag"; title: string; details: string[] } {
  if (options.riskFlags.length > 0) {
    return {
      tone: "flag",
      title: `Guard flagged this snapshot (${options.riskLevel}). Look at these before Approve / Hold / Deny.`,
      details: [...options.riskFlags],
    };
  }

  return {
    tone: "pass",
    title:
      "Guard passed. You are deciding on this exact caption and media. Approve is not publish.",
    details: [],
  };
}

export function reviewCardNextAction(options: { status: string }): string {
  switch (options.status) {
    case "IN_REVIEW":
      return "Next: Approve, Hold, or Deny this snapshot. None of those publish.";
    case "HELD":
      return "Next: Back to review or Approve this snapshot. Hold is not publish.";
    case "APPROVED":
      return "Next: Schedule is a separate yes. Approve already happened and did not publish.";
    case "REJECTED":
      return "Denied. Copy it for another pass. This did not publish.";
    default:
      return "Review this snapshot. Approve / Hold / Deny never publish.";
  }
}

export function reviewQueueFocusHref(draftId: string): string {
  return `/review-queue?focus=${encodeURIComponent(draftId)}`;
}

export function reviewQueueTabForFocus(
  focusStatus: string | null | undefined,
  fallback: "review" | "held" | "approved"
): "review" | "held" | "approved" | "denied" {
  switch (focusStatus) {
    case "IN_REVIEW":
      return "review";
    case "HELD":
      return "held";
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "denied";
    default:
      return fallback;
  }
}
