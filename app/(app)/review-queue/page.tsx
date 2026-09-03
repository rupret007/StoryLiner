import { prisma } from "@/lib/prisma";
import { ReviewQueueClient } from "./client";
import {
  PROMO_PIPELINE_PATH,
  REVIEW_DESK_NO_PUBLISH,
  REVIEW_DESK_QUEUE_STATUSES,
  parseReviewDeskFocusId,
  reviewDeskAskedForFocus,
  reviewDeskFocusMissing,
} from "@/lib/services/publish/review-desk";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Review Queue" };
export const dynamic = "force-dynamic";

const reviewDeskInclude = {
  band: {
    include: {
      voiceProfile: true,
      platformAccounts: { where: { isActive: true } },
    },
  },
  versions: { orderBy: { version: "desc" as const } },
  campaign: true,
  generationRun: {
    select: { campaignType: true, inputContext: true },
  },
  scheduledPost: {
    include: {
      platformAccount: { select: { handle: true, isConnected: true } },
      job: { select: { status: true, runAt: true } },
    },
  },
} satisfies Prisma.DraftInclude;

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const askedForFocus = reviewDeskAskedForFocus(focus);
  const focusId = parseReviewDeskFocusId(focus);

  const queueDrafts = await prisma.draft.findMany({
    where: { status: { in: [...REVIEW_DESK_QUEUE_STATUSES] } },
    include: reviewDeskInclude,
    orderBy: { createdAt: "desc" },
  });

  let focusedWalk = focusId
    ? queueDrafts.find((draft) => draft.id === focusId) ?? null
    : null;

  if (focusId && !focusedWalk) {
    focusedWalk = await prisma.draft.findFirst({
      where: { id: focusId, status: { in: ["SCHEDULED", "PUBLISHED"] } },
      include: reviewDeskInclude,
    });
  }

  const drafts =
    focusedWalk && !queueDrafts.some((draft) => draft.id === focusedWalk.id)
      ? [...queueDrafts, focusedWalk]
      : queueDrafts;

  const focusMissing = reviewDeskFocusMissing({
    askedForFocus,
    focusedDraftId: focusedWalk?.id,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-sm font-medium text-foreground">
          {PROMO_PIPELINE_PATH}
        </p>
        <p className="text-sm text-muted-foreground">
          Open a snapshot to review the caption, media, guard, and voice.
          {` ${REVIEW_DESK_NO_PUBLISH} `}
          Live destinations stay Facebook, Instagram, and YouTube.
        </p>
      </div>
      <ReviewQueueClient
        drafts={drafts}
        focusDraftId={focusId ?? undefined}
        focusMissing={focusMissing}
      />
    </div>
  );
}
