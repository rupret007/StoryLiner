/**
 * Review decision rail after leftover #32 / #34.
 *
 * The queue already had Approve / Hold / Deny / Schedule as buttons in
 * one wrap next to Edit / Copy / Archive. Jeff could not tell the next
 * yes from a tool, or Schedule from Approve. This rail is the product:
 * one labeled decision per verb, one consequence, one next yes.
 * Approve, Hold, Deny, Resume, and Schedule never publish.
 */

export const REVIEW_DECISION_IDS = [
  "approve",
  "hold",
  "deny",
  "resume",
  "schedule",
] as const;

export type ReviewDecisionId = (typeof REVIEW_DECISION_IDS)[number];

export type ReviewDecisionTone = "primary" | "secondary" | "destructive";
export type ReviewDecisionPresentation = "button" | "inline";
export type ReviewDecisionSurface = "queue" | "desk";

export type ReviewDecision = {
  id: ReviewDecisionId;
  label: string;
  consequence: string;
  nextYes: boolean;
  tone: ReviewDecisionTone;
  publishes: false;
  presentation: ReviewDecisionPresentation;
};

export type ReviewDecisionRailView = {
  heading: string;
  decisions: ReviewDecision[];
  nextYesId: ReviewDecisionId | null;
};

export const REVIEW_QUEUE_DECISION_HELP =
  "Approve readies a schedule. Hold parks. Deny rejects. Schedule queues a job. None of those go live.";

/** Matches the server gates in safety.ts. Schedule is APPROVED only. */
export function reviewDecisionIdsForStatus(
  status: string
): ReviewDecisionId[] {
  switch (status) {
    case "IN_REVIEW":
      return ["approve", "hold", "deny"];
    case "HELD":
      return ["approve", "resume", "deny"];
    case "APPROVED":
      return ["schedule", "hold"];
    default:
      return [];
  }
}

export function reviewDecisionNextYesId(
  status: string
): ReviewDecisionId | null {
  switch (status) {
    case "IN_REVIEW":
    case "HELD":
      return "approve";
    case "APPROVED":
      return "schedule";
    default:
      return null;
  }
}

export function reviewDecisionHeading(status: string): string {
  switch (status) {
    case "IN_REVIEW":
      return "Next: Approve, Hold, or Deny this snapshot. None of those publish.";
    case "HELD":
      return "Next: Back to review or Approve this snapshot. Hold is not publish.";
    case "APPROVED":
      return "Next: Schedule is a separate yes. Approve already happened and did not publish.";
    case "REJECTED":
      return "Denied. Copy it for another pass. This did not publish.";
    case "SCHEDULED":
      return "Next: the worker publishes when this job is due. This desk has no Publish button.";
    case "PUBLISHED":
      return "The worker already published this. This desk never publishes.";
    default:
      return "Review this snapshot. Approve / Hold / Deny never publish.";
  }
}

export function reviewDecisionLabel(id: ReviewDecisionId): string {
  switch (id) {
    case "approve":
      return "Approve";
    case "hold":
      return "Hold";
    case "deny":
      return "Deny";
    case "resume":
      return "Back to review";
    case "schedule":
      return "Schedule";
  }
}

export function reviewDecisionTone(id: ReviewDecisionId): ReviewDecisionTone {
  if (id === "deny") return "destructive";
  if (id === "approve" || id === "schedule") return "primary";
  return "secondary";
}

export function reviewDecisionPublishes(id: ReviewDecisionId): false {
  switch (id) {
    case "approve":
    case "hold":
    case "deny":
    case "resume":
    case "schedule":
      return false;
  }
}

export function reviewDecisionConsequence(
  id: ReviewDecisionId,
  options: { possibleLiveWrite?: boolean; riskLevel?: string } = {}
): string {
  const live = Boolean(options.possibleLiveWrite);
  const high = options.riskLevel === "HIGH";

  switch (id) {
    case "approve":
      if (high && live) {
        return "Guard flagged this. Confirm, then it is ready to schedule after you check the live page.";
      }
      if (high) {
        return "Guard flagged this. Confirm, then it is ready to schedule. Not live.";
      }
      if (live) {
        return "Ready to schedule after you check the live page. Not live.";
      }
      return "Ready to schedule. Not live.";
    case "hold":
      return live
        ? "Park for later. The live-page check stays. Not scheduled."
        : "Park for later. Not scheduled.";
    case "deny":
      return "Reject this caption. It will not be scheduled.";
    case "resume":
      return "Return it to Needs Review.";
    case "schedule":
      return live
        ? "Check the live page, then queue a worker job. Still not live."
        : "Queue a worker job. Still not live.";
  }
}

export function reviewDecisionPresentation(
  id: ReviewDecisionId,
  options: { status: string; surface: ReviewDecisionSurface }
): ReviewDecisionPresentation {
  if (
    id === "schedule" &&
    options.status === "APPROVED" &&
    options.surface === "desk"
  ) {
    return "inline";
  }
  return "button";
}

export function reviewDecisionRail(options: {
  status: string;
  surface?: ReviewDecisionSurface;
  possibleLiveWrite?: boolean;
  riskLevel?: string;
}): ReviewDecisionRailView {
  const surface = options.surface ?? "queue";
  const nextYesId = reviewDecisionNextYesId(options.status);

  return {
    heading: reviewDecisionHeading(options.status),
    nextYesId,
    decisions: reviewDecisionIdsForStatus(options.status).map((id) => ({
      id,
      label: reviewDecisionLabel(id),
      consequence: reviewDecisionConsequence(id, {
        possibleLiveWrite: options.possibleLiveWrite,
        riskLevel: options.riskLevel,
      }),
      nextYes: id === nextYesId,
      tone: reviewDecisionTone(id),
      publishes: false,
      presentation: reviewDecisionPresentation(id, {
        status: options.status,
        surface,
      }),
    })),
  };
}

/** Edit / Copy / Archive stay off the decision rail. */
export function reviewCardTools(status: string): {
  edit: boolean;
  copy: boolean;
  archive: boolean;
} {
  const livePath = status === "SCHEDULED" || status === "PUBLISHED";
  return {
    edit:
      status === "IN_REVIEW" || status === "HELD" || status === "APPROVED",
    copy: !livePath,
    archive: !livePath,
  };
}
