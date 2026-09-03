import { prisma } from "@/lib/prisma";
import { ReviewQueueClient } from "./client";
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
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-sm font-medium text-foreground">
          Jeff talks to Bob. StoryLiner is the promo engine.
        </p>
        <p className="text-sm text-muted-foreground">
          Bob&apos;s drafts land here as guarded snapshots. Approve, Hold, and
          Deny decide on the exact caption and media on the card — none of
          them go live. Live posts still need Approve → Schedule → a connected
          Facebook, Instagram, or YouTube account → worker. Nothing
          auto-publishes.
        </p>
      </div>
      <ReviewQueueClient drafts={drafts} focusDraftId={focus} />
    </div>
  );
}
