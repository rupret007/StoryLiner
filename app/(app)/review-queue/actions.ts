"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import {
  assertCanApproveDraft,
  assertCanDenyDraft,
  assertCanDuplicateDraft,
  assertCanHoldDraft,
  assertCanMutateDraftCaption,
  assertCanResumeHeldDraft,
  assertCanReturnScheduleToApproved,
  assertCanScheduleAfterPossibleLiveWrite,
  assertReadyForLivePublish,
  canRescheduleJob,
  draftHasPossibleLiveWrite,
  mergeReviewNotesPreservingPossibleLiveWrite,
  reviewNotesForDuplicateDraft,
  sanitizeMediaUrls,
  stripPossibleLiveWriteNote,
  unscheduleJobErrorMessage,
  withPossibleLiveWriteNote,
} from "@/lib/services/publish/safety";
import { jobMayHaveStartedAdapterWrite } from "@/lib/jobs/publish-attempt";
import { evaluateGuardrails, riskLevelFromFlags } from "@/lib/services/guardrails/policy";
import { rewriteDraft } from "@/lib/services/content/rewrite";
import { attachDraftMediaSchema, scheduleDraftSchema } from "@/lib/schemas/content";
import type { AttachDraftMediaInput, RewriteDraftInput, ScheduleDraftInput } from "@/lib/schemas/content";

export async function approveDraft(
  draftId: string,
  notes?: string,
  confirmHighRisk = false
) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const approvable = assertCanApproveDraft({
    status: draft.status,
    riskLevel: draft.riskLevel,
    confirmHighRisk,
  });
  if (!approvable.ok) {
    throw new Error(approvable.reason);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewNotes: mergeReviewNotesPreservingPossibleLiveWrite(draft.reviewNotes, notes),
    },
  });
  revalidatePath("/review-queue");
  revalidatePath("/scheduled-posts");
}

export async function denyDraft(draftId: string, reason?: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const deniable = assertCanDenyDraft({ status: draft.status });
  if (!deniable.ok) {
    throw new Error(deniable.reason);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedReason: reason ?? "Denied from review queue",
    },
  });
  revalidatePath("/review-queue");
}

/** @deprecated Use denyDraft. Kept so existing callers keep working. */
export async function rejectDraft(draftId: string, reason?: string) {
  return denyDraft(draftId, reason);
}

export async function holdDraft(draftId: string, notes?: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const holdable = assertCanHoldDraft({ status: draft.status });
  if (!holdable.ok) {
    throw new Error(holdable.reason);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: "HELD",
      reviewNotes: mergeReviewNotesPreservingPossibleLiveWrite(
        draft.reviewNotes,
        notes ?? "Held from review queue. Approve does not publish."
      ),
    },
  });
  revalidatePath("/review-queue");
}

export async function resumeHeldDraft(draftId: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const resumable = assertCanResumeHeldDraft({ status: draft.status });
  if (!resumable.ok) {
    throw new Error(resumable.reason);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "IN_REVIEW" },
  });
  revalidatePath("/review-queue");
}

export async function archiveDraft(draftId: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status === "SCHEDULED" || draft.status === "PUBLISHED") {
    throw new Error(`Draft cannot be archived from status ${draft.status}.`);
  }

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
  const duplicable = assertCanDuplicateDraft({ status: original.status });
  if (!duplicable.ok) {
    throw new Error(duplicable.reason);
  }

  const reviewNotes = reviewNotesForDuplicateDraft(original.reviewNotes);

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
      mediaUrls: original.mediaUrls,
      ctaText: original.ctaText ?? undefined,
      altText: original.altText ?? undefined,
      imagePrompt: original.imagePrompt ?? undefined,
      fanReplies: original.fanReplies,
      brandFitScore: original.brandFitScore,
      confidenceNotes: original.confidenceNotes,
      riskLevel: original.riskLevel,
      riskFlags: original.riskFlags,
      currentVersion: 1,
      reviewNotes,
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

  const alreadyScheduled = await prisma.scheduledPost.findUnique({
    where: { draftId: draft.id },
  });
  if (alreadyScheduled) {
    throw new Error(
      "This draft already has a scheduled post. Unschedule or return it first. This does not publish."
    );
  }

  const liveWriteGate = assertCanScheduleAfterPossibleLiveWrite({
    possibleLiveWrite: draftHasPossibleLiveWrite(draft.reviewNotes),
    confirmCheckedNoLivePost: input.confirmCheckedNoLivePost,
  });
  if (!liveWriteGate.ok) {
    throw new Error(liveWriteGate.reason);
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

  const liveSafety = assertReadyForLivePublish({
    socialAdapterMode: process.env.SOCIAL_ADAPTER ?? "mock",
    platform: draft.platform,
    accountIsConnected: account.isConnected,
    accountIsActive: account.isActive,
    mediaUrls: draft.mediaUrls,
    accountMetadata: account.metadata,
  });
  if (!liveSafety.ok) {
    throw new Error(liveSafety.reason);
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

    // Claim APPROVED → SCHEDULED so a concurrent schedule cannot win twice.
    const moved = await tx.draft.updateMany({
      where: { id: draft.id, status: "APPROVED" },
      data: {
        status: "SCHEDULED",
        reviewNotes: stripPossibleLiveWriteNote(draft.reviewNotes),
      },
    });
    if (moved.count === 0) {
      throw new Error("Draft is no longer approved. Nothing was published.");
    }

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

  const existing = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
    include: { job: true },
  });

  if (existing.status !== "SCHEDULED") {
    throw new Error("Only SCHEDULED posts can be rescheduled.");
  }

  const writeStarted = existing.job
    ? jobMayHaveStartedAdapterWrite(existing.job.payload)
    : false;
  if (!canRescheduleJob(existing.job?.status, writeStarted)) {
    throw new Error(
      writeStarted
        ? "Cannot reschedule after a Facebook / Instagram / YouTube write started. " +
          "Check the platform, then Return to Approved. This does not publish."
        : "Cannot reschedule a post that is already publishing or completed. " +
          "Resetting a RUNNING job to PENDING can double-publish."
    );
  }

  const scheduledPost = await prisma.$transaction(async (tx) => {
    if (existing.jobId) {
      const claimed = await tx.job.updateMany({
        where: { id: existing.jobId, status: "PENDING" },
        data: { runAt: newDate },
      });
      if (claimed.count === 0) {
        throw new Error(
          "Cannot reschedule a post that is already publishing or completed."
        );
      }
    }

    return tx.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { scheduledFor: newDate },
    });
  });

  revalidatePath("/scheduled-posts");
  return scheduledPost;
}

export async function attachDraftMedia(rawInput: AttachDraftMediaInput) {
  const input = attachDraftMediaSchema.parse(rawInput);
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
  });

  if (
    draft.status !== "IN_REVIEW" &&
    draft.status !== "APPROVED" &&
    draft.status !== "HELD"
  ) {
    throw new Error("Media can only be attached while the draft is in review, held, or approved.");
  }

  const mediaUrls = sanitizeMediaUrls(input.mediaUrls);
  const provided = input.mediaUrls.map((url) => url.trim()).filter(Boolean);
  if (provided.length > 0 && mediaUrls.length === 0) {
    throw new Error("Media URL must be a public https:// link. http, data, and javascript URLs are rejected.");
  }

  const updated = await prisma.draft.update({
    where: { id: draft.id },
    data: { mediaUrls },
  });

  revalidatePath("/review-queue");
  return updated;
}

export async function returnScheduleToApproved(
  scheduledPostId: string,
  confirmCheckedPlatform = false
) {
  const existing = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
    include: { job: true, draft: true },
  });

  const adapterWriteStarted = existing.job
    ? jobMayHaveStartedAdapterWrite(existing.job.payload)
    : false;
  const allowed = assertCanReturnScheduleToApproved({
    scheduledStatus: existing.status,
    draftStatus: existing.draft.status,
    jobStatus: existing.job?.status,
    adapterWriteStarted,
    confirmCheckedPlatform,
  });
  if (!allowed.ok) {
    throw new Error(allowed.reason);
  }

  await prisma.$transaction(async (tx) => {
    if (existing.jobId && existing.job?.status === "PENDING") {
      const claimed = await tx.job.updateMany({
        where: { id: existing.jobId, status: "PENDING" },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage: unscheduleJobErrorMessage(adapterWriteStarted),
          retryCount: existing.job.maxRetries,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          "Cannot unschedule a post that is already publishing. This does not publish."
        );
      }
    }

    await tx.scheduledPost.delete({ where: { id: scheduledPostId } });

    const reviewNotes =
      adapterWriteStarted || draftHasPossibleLiveWrite(existing.draft.reviewNotes)
        ? withPossibleLiveWriteNote(existing.draft.reviewNotes)
        : existing.job?.status === "PENDING"
          ? "Unscheduled. Approve is not publish."
          : "Returned from a failed publish job. Approve is not publish. Schedule again after the fix.";

    await tx.draft.update({
      where: { id: existing.draftId },
      data: {
        status: "APPROVED",
        reviewNotes,
      },
    });
  });

  revalidatePath("/review-queue");
  revalidatePath("/scheduled-posts");
}

/** @deprecated Use returnScheduleToApproved. Kept so existing callers keep working. */
export async function returnFailedScheduleToApproved(
  scheduledPostId: string,
  confirmCheckedPlatform = false
) {
  return returnScheduleToApproved(scheduledPostId, confirmCheckedPlatform);
}

export async function updateDraftCaption(draftId: string, caption: string) {
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
    include: { band: { include: { voiceProfile: true } } },
  });
  const mutable = assertCanMutateDraftCaption({ status: draft.status });
  if (!mutable.ok) {
    throw new Error(mutable.reason);
  }

  const newVersion = draft.currentVersion + 1;

  const otherBands = await prisma.band.findMany({
    where: { id: { not: draft.bandId } },
    select: { name: true },
  });
  const violations = evaluateGuardrails({
    caption,
    bandName: draft.band.name,
    otherBandNames: otherBands.map((b) => b.name),
    emojiTolerance: draft.band.voiceProfile?.emojiTolerance,
    isAutoPublish: false,
  });
  const riskFlags = violations.map((v) => v.detail);

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
      riskFlags,
      riskLevel: riskLevelFromFlags(riskFlags.length),
    },
  });

  revalidatePath("/review-queue");
  return updated;
}
