import { prisma } from "@/lib/prisma";
import { ReviewQueueClient } from "./client";
import {
  PROMO_PIPELINE_PATH,
  REVIEW_DESK_NO_PUBLISH,
} from "@/lib/services/publish/review-desk";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Review Queue" };
export const dynamic = "force-dynamic";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const drafts = await prisma.draft.findMany({
    where: { status: { in: ["IN_REVIEW", "HELD", "APPROVED", "REJECTED"] } },
    include: {
      band: {
        include: {
          voiceProfile: true,
          platformAccounts: { where: { isActive: true } },
        },
      },
      versions: { orderBy: { version: "desc" } },
      campaign: true,
      generationRun: {
        select: { campaignType: true, inputContext: true },
      },
    },
    orderBy: { createdAt: "desc" },
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
      <ReviewQueueClient drafts={drafts} focusDraftId={focus} />
    </div>
  );
}
