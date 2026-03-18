"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import { rewriteDraft } from "@/lib/services/content/rewrite";
import { scheduleDraftSchema } from "@/lib/schemas/content";
import type { RewriteDraftInput, ScheduleDraftInput } from "@/lib/schemas/content";

export async function approveDraft(draftId: string, notes?: string) {
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });
  revalidatePath("/review-queue");
  revalidatePath("/scheduled-posts");
}

export async function rejectDraft(draftId: string, reason?: string) {
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedReason: reason,
    },
  });
  revalidatePath("/review-queue");
}

export async function archiveDraft(draftId: string) {
  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "ARCHIVED" },
  });
  revalidatePath("/review-queue");
}

export async function duplicateDraft(draftId: string) {
  const original = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
  });

  const duplicate = await prisma.draft.create({
    data: {
      bandId: original.bandId,
      campaignId: original.campaignId,
      platform: original.platform,
      status: "IN_REVIEW",
      toneVariant: original.toneVariant,
      contentLength: original.contentLength,
      caption: original.caption,
      hashtags: original.hashtags,
      ctaText: original.ctaText ?? undefined,
      altText: original.altText ?? undefined,
      imagePrompt: original.imagePrompt ?? undefined,
      fanReplies: original.fanReplies,
      brandFitScore: original.brandFitScore,
      confidenceNotes: original.confidenceNotes,
      riskLevel: original.riskLevel,
      riskFlags: original.riskFlags,
      currentVersion: 1,
    },
  });

  await prisma.draftVersion.create({
    data: {
      draftId: duplicate.id,
      version: 1,
      caption: original.caption,
      hashtags: original.hashtags,
      ctaText: original.ctaText ?? undefined,
      changeNotes: `Duplicated from draft ${original.id}`,
    },
  });

  revalidatePath("/review-queue");
  return duplicate;
}

export async function rewriteDraftAction(input: RewriteDraftInput) {
  const draft = await rewriteDraft(input);
  revalidatePath("/review-queue");
  return draft;
}

export async function scheduleApprovedDraft(rawInput: ScheduleDraftInput) {
  // Validate input shape + future-time rule
  const input = scheduleDraftSchema.parse(rawInput);

  const scheduledFor = new Date(input.scheduledFor);
  if (scheduledFor <= new Date()) {
    throw new Error("Schedule time must be in the future.");
  }

  // Load draft with band to validate account ownership
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
    include: { band: true },
  });

  if (draft.status !== "APPROVED") {
    throw new Error("Draft must be approved before scheduling.");
  }

  // Validate platform content limits
  const validation = validateDraftForPlatform(draft);
  if (!validation.isValid) {
    throw new Error(`Platform validation failed: ${validation.errors.join(", ")}`);
  }

  // Validate account: must belong to the same band, match platform, and be active
  const account = await prisma.platformAccount.findFirst({
    where: {
      id: input.platformAccountId,
      bandId: draft.bandId,
      platform: draft.platform,
      isActive: true,
    },
  });

  if (!account) {
    throw new Error(
      `No active ${draft.platform} account found for ${draft.band.name}. ` +
        "The selected account must belong to the same band and match the draft's platform."
    );
  }

  // Atomic transaction: create scheduled post + job + update draft status together
  const scheduledPost = await prisma.$transaction(async (tx) => {
    // Create the job record
    const job = await tx.job.create({
      data: {
        type: "PUBLISH_POST",
        payload: { scheduledPostId: "__pending__" },
        runAt: scheduledFor,
        status: "PENDING",
      },
    });

    // Create the scheduled post linked to the job
    const post = await tx.scheduledPost.create({
      data: {
        bandId: draft.bandId,
        draftId: draft.id,
        platformAccountId: account.id,
        scheduledFor,
        status: "SCHEDULED",
        jobId: job.id,
      },
    });

    // Backfill job payload with real scheduled post ID
    await tx.job.update({
      where: { id: job.id },
      data: { payload: { scheduledPostId: post.id } },
    });

    // Update draft status
    await tx.draft.update({
      where: { id: draft.id },
      data: { status: "SCHEDULED" },
    });

    return post;
  });

  revalidatePath("/review-queue");
  revalidatePath("/scheduled-posts");
  return scheduledPost;
}

export async function reschedulePost(
  scheduledPostId: string,
  newScheduledFor: string
) {
  const newDate = new Date(newScheduledFor);

  if (newDate <= new Date()) {
    throw new Error("New schedule time must be in the future.");
  }

  // Verify post is still in SCHEDULED state
  const existing = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
  });

  if (existing.status !== "SCHEDULED") {
    throw new Error("Only SCHEDULED posts can be rescheduled.");
  }

  const scheduledPost = await prisma.$transaction(async (tx) => {
    const post = await tx.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { scheduledFor: newDate },
    });

    if (post.jobId) {
      await tx.job.update({
        where: { id: post.jobId },
        data: { runAt: newDate, status: "PENDING" },
      });
    }

    return post;
  });

  revalidatePath("/scheduled-posts");
  return scheduledPost;
}

export async function updateDraftCaption(draftId: string, caption: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const newVersion = draft.currentVersion + 1;

  await prisma.draftVersion.create({
    data: {
      draftId,
      version: newVersion,
      caption,
      hashtags: draft.hashtags,
      ctaText: draft.ctaText ?? undefined,
      changeNotes: "Manual edit",
    },
  });

  const updated = await prisma.draft.update({
    where: { id: draftId },
    data: {
      caption,
      currentVersion: newVersion,
      status: "IN_REVIEW",
    },
  });

  revalidatePath("/review-queue");
  return updated;
}
