import { reviewQueueFocusHref } from "@/lib/services/publish/review-snapshot";

export type DashboardNextAction = {
  tone: "danger" | "review" | "schedule" | "ready";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
};

type DashboardNextActionInput = {
  failedWriteStartedCount: number;
  failedWriteDraftId?: string;
  possibleLiveWriteCount: number;
  possibleLiveWriteDraftId?: string;
  reviewCount: number;
  reviewDraftId?: string;
  approvedCount: number;
  approvedDraftId?: string;
  scheduledCount: number;
  bandCount: number;
};

function reviewHref(draftId: string | undefined): string {
  return draftId ? reviewQueueFocusHref(draftId) : "/review-queue";
}

/**
 * One honest first-screen decision for the operator.
 *
 * Safety uncertainty always outranks normal content work. The guide only
 * navigates to an existing surface; it never approves, schedules, or publishes.
 */
export function dashboardNextAction(
  input: DashboardNextActionInput
): DashboardNextAction {
  if (input.failedWriteStartedCount > 0) {
    const count = input.failedWriteStartedCount;
    return {
      tone: "danger",
      eyebrow: "Check before anything else",
      title: `Verify ${count} possible live write${count === 1 ? "" : "s"}`,
      description:
        "A Facebook / Instagram / YouTube write may already be live. Check the platform before rescheduling; StoryLiner will not guess.",
      href: input.failedWriteDraftId
        ? reviewQueueFocusHref(input.failedWriteDraftId)
        : "/scheduled-posts",
      cta: "Check live status",
    };
  }

  if (input.possibleLiveWriteCount > 0) {
    const count = input.possibleLiveWriteCount;
    return {
      tone: "danger",
      eyebrow: "Check before scheduling",
      title: `Verify ${count} possible live post${count === 1 ? "" : "s"}`,
      description:
        "This work carries a possible-live-write hold. Check Facebook / Instagram / YouTube before giving another schedule yes.",
      href: reviewHref(input.possibleLiveWriteDraftId),
      cta: "Review held work",
    };
  }

  if (input.reviewCount > 0) {
    const count = input.reviewCount;
    return {
      tone: "review",
      eyebrow: "Your next decision",
      title: `Review ${count} draft${count === 1 ? "" : "s"}`,
      description:
        "Look at the caption, media, guard, and voice. Approve, Hold, and Deny do not publish.",
      href: reviewHref(input.reviewDraftId),
      cta: "Review first draft",
    };
  }

  if (input.approvedCount > 0) {
    const count = input.approvedCount;
    return {
      tone: "schedule",
      eyebrow: "Ready for your next yes",
      title: `Schedule ${count} approved draft${count === 1 ? "" : "s"}`,
      description:
        "Approval is complete. Choose a time and account on the approved snapshot; opening it does not publish.",
      href: reviewHref(input.approvedDraftId),
      cta: "Open approved work",
    };
  }

  if (input.scheduledCount > 0) {
    const count = input.scheduledCount;
    return {
      tone: "ready",
      eyebrow: "On track",
      title: `${count} post${count === 1 ? " is" : "s are"} queued`,
      description:
        "No review or schedule decision is waiting. Check the worker queue if you want to monitor what is next.",
      href: "/scheduled-posts",
      cta: "View schedule",
    };
  }

  if (input.bandCount === 0) {
    return {
      tone: "ready",
      eyebrow: "Start here",
      title: "Add your first band",
      description:
        "A band keeps voice, accounts, and content separated before anything enters review.",
      href: "/bands/new",
      cta: "Add a band",
    };
  }

  return {
    tone: "ready",
    eyebrow: "Ready for a new idea",
    title: "Create the next post",
    description:
      "Generate a guarded draft for one band. It will land in Needs Review and nothing publishes automatically.",
    href: "/content-studio",
    cta: "Open Content Studio",
  };
}
