import { prisma } from "@/lib/prisma";
import { ReviewQueueClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Review Queue" };
export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const drafts = await prisma.draft.findMany({
    where: { status: { in: ["IN_REVIEW", "APPROVED"] } },
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

  return <ReviewQueueClient drafts={drafts} />;
}
