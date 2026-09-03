"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import {
  assertCanApproveDraft,
  assertCanArchiveDraft,
  assertCanDenyDraft,
  assertCanDuplicateDraft,
  assertCanHoldDraft,
  assertCanMutateDraftCaption,
  assertCanMutateDraftMedia,
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
import { attachDraftMediaSchema, rewriteDraftSchema, scheduleDraftSchema } from "@/lib/schemas/content";
import type { AttachDraftMediaInput, RewriteDraftInput, ScheduleDraftInput } from "@/lib/schemas/content";
import {
  APPROVE_SNAPSHOT_RACE,
  REVIEW_SNAPSHOT_RACE,
  SCHEDULE_SNAPSHOT_RACE,
  assertReviewSnapshotMatches,
  parseReviewSnapshotReceipt,
  reviewSnapshotWhere,
  type ReviewSnapshotReceipt,
} from "@/lib/services/publish/review-snapshot";

export async function approveDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt,
  notes?: string,
  confirmHighRisk = false
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot, "approve");
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  assertReviewSnapshotMatches(draft, receipt, "approve");

  const approvable = assertCanApproveDraft({
    status: draft.status,
    riskLevel: draft.riskLevel,
    confirmHighRisk,
  });
  if (!approvable.ok) {
    throw new Error(approvable.reason);
  }

  // Bind Jeff's yes to the exact caption / media / guard snapshot the card
  // displayed. updatedAt plus the creative fingerprint refuse an unseen
  // rewrite. updateMany compare-and-sets the clock so a mid-request change
  // also loses safely. Neither path schedules or publishes.
  const approved = await prisma.draft.updateMany({
    where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewNotes: mergeReviewNotesPreservingPossibleLiveWrite(draft.reviewNotes, notes),
    },
  });
  if (approved.count === 0) {
    throw new Error(APPROVE_SNAPSHOT_RACE);
  }

  revalidatePath("/review-queue");
  revalidatePath("/scheduled-posts");
}

export async function denyDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt,
  reason?: string
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  assertReviewSnapshotMatches(draft, receipt);

  const deniable = assertCanDenyDraft({ status: draft.status });
  if (!deniable.ok) {
    throw new Error(deniable.reason);
  }

  const denied = await prisma.draft.updateMany({
    where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedReason: reason ?? "Denied from review queue",
    },
  });
  if (denied.count === 0) {
    throw new Error(REVIEW_SNAPSHOT_RACE);
  }
  revalidatePath("/review-queue");
}

/** @deprecated Use denyDraft. Kept so existing callers keep working. */
export async function rejectDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt,
  reason?: string
) {
  return denyDraft(draftId, reviewedSnapshot, reason);
}

export async function holdDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt,
  notes?: string
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  assertReviewSnapshotMatches(draft, receipt);

  const holdable = assertCanHoldDraft({ status: draft.status });
  if (!holdable.ok) {
    throw new Error(holdable.reason);
  }

  const held = await prisma.draft.updateMany({
    where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
    data: {
      status: "HELD",
      reviewNotes: mergeReviewNotesPreservingPossibleLiveWrite(
        draft.reviewNotes,
        notes ?? "Held from review queue. Approve does not publish."
      ),
    },
  });
  if (held.count === 0) {
    throw new Error(REVIEW_SNAPSHOT_RACE);
  }
  revalidatePath("/review-queue");
}

export async function resumeHeldDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  assertReviewSnapshotMatches(draft, receipt);
  const resumable = assertCanResumeHeldDraft({ status: draft.status });
  if (!resumable.ok) {
    throw new Error(resumable.reason);
  }

  const resumed = await prisma.draft.updateMany({
    where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
    data: { status: "IN_REVIEW" },
  });
  if (resumed.count === 0) {
    throw new Error(REVIEW_SNAPSHOT_RACE);
  }
  revalidatePath("/review-queue");
}

export async function archiveDraft(
  draftId: string,
  reviewedSnapshot: ReviewSnapshotReceipt
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  assertReviewSnapshotMatches(draft, receipt);
  const archivable = assertCanArchiveDraft({ status: draft.status });
  if (!archivable.ok) {
    throw new Error(archivable.reason);
  }

  const archived = await prisma.draft.updateMany({
    where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
    data: { status: "ARCHIVED" },
  });
  if (archived.count === 0) {
    throw new Error(REVIEW_SNAPSHOT_RACE);
  }
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

export async function rewriteDraftAction(rawInput: RewriteDraftInput) {
  const input = rewriteDraftSchema.parse(rawInput);
  const draft = await rewriteDraft(input);
  revalidatePath("/review-queue");
  return draft;
}

export async function scheduleApprovedDraft(rawInput: ScheduleDraftInput) {
  // Validate input shape + future-time rule
  const input = scheduleDraftSchema.parse(rawInput);
  const receipt = parseReviewSnapshotReceipt(input.reviewedSnapshot, "schedule");

  const scheduledFor = new Date(input.scheduledFor);
  if (scheduledFor <= new Date()) {
    throw new Error("Schedule time must be in the future.");
  }

  // Load draft with band to validate account ownership
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
    include: { band: true },
  });
  assertReviewSnapshotMatches(draft, receipt, "schedule");

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

    // Claim the approved snapshot Jeff scheduled — a stale card or a
    // mid-request rewrite cannot queue unseen creative. This does not publish.
    const moved = await tx.draft.updateMany({
      where: reviewSnapshotWhere(draft.id, "APPROVED", receipt.updatedAt),
      data: {
        status: "SCHEDULED",
        reviewNotes: stripPossibleLiveWriteNote(draft.reviewNotes),
      },
    });
    if (moved.count === 0) {
      throw new Error(SCHEDULE_SNAPSHOT_RACE);
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
  const receipt = parseReviewSnapshotReceipt(input.reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
  });
  assertReviewSnapshotMatches(draft, receipt);

  const mutable = assertCanMutateDraftMedia({ status: draft.status });
  if (!mutable.ok) {
    throw new Error(mutable.reason);
  }

  const mediaUrls = sanitizeMediaUrls(input.mediaUrls);
  const provided = input.mediaUrls.map((url) => url.trim()).filter(Boolean);
  if (provided.length > 0 && mediaUrls.length === 0) {
    throw new Error("Media URL must be a public https:// link. http, data, and javascript URLs are rejected.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Media is reviewed creative. Compare-and-set the card snapshot so a
    // concurrent Schedule or rewrite cannot be followed by a stale media
    // write onto unseen caption.
    const moved = await tx.draft.updateMany({
      where: reviewSnapshotWhere(draft.id, draft.status, receipt.updatedAt),
      data: {
        mediaUrls,
        status: "IN_REVIEW",
        reviewedAt: null,
      },
    });
    if (moved.count === 0) {
      throw new Error(
        "Draft changed while media was being saved. Refresh and review its current status. " +
          "This media save did not schedule or publish."
      );
    }

    return tx.draft.findUniqueOrThrow({ where: { id: draft.id } });
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

export async function updateDraftCaption(
  draftId: string,
  caption: string,
  reviewedSnapshot: ReviewSnapshotReceipt
) {
  const receipt = parseReviewSnapshotReceipt(reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
    include: { band: { include: { voiceProfile: true } } },
  });
  assertReviewSnapshotMatches(draft, receipt);

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

  const updated = await prisma.$transaction(async (tx) => {
    const moved = await tx.draft.updateMany({
      where: reviewSnapshotWhere(draftId, draft.status, receipt.updatedAt),
      data: {
        caption,
        currentVersion: newVersion,
        status: "IN_REVIEW",
        riskFlags,
        riskLevel: riskLevelFromFlags(riskFlags.length),
        reviewedAt: null,
      },
    });
    if (moved.count === 0) {
      throw new Error(REVIEW_SNAPSHOT_RACE);
    }

    await tx.draftVersion.create({
      data: {
        draftId,
        version: newVersion,
        caption,
        hashtags: draft.hashtags,
        ctaText: draft.ctaText ?? undefined,
        changeNotes: "Manual edit",
      },
    });

    return tx.draft.findUniqueOrThrow({ where: { id: draftId } });
  });

  revalidatePath("/review-queue");
  return updated;
}
