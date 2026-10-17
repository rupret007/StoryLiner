import { prisma } from "@/lib/prisma";
import { getSocialAdapter } from "@/lib/adapters/social";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import {
  assertLivePublishResult,
  assertReadyForLivePublish,
  sanitizeMediaUrls,
} from "@/lib/services/publish/safety";
import {
  adapterRetryRefusedReason,
  parsePublishJobPayload,
  withAdapterWriteStarted,
} from "@/lib/jobs/publish-attempt";
import type { Job } from "@prisma/client";

export type PublishHandlerOutcome = "published" | "already-published";

async function reconcileAlreadyPublished(scheduledPostId: string, draftId: string): Promise<void> {
  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { status: "PUBLISHED" },
  });
  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "PUBLISHED" },
  });
}

export async function handlePublishPost(job: Job): Promise<PublishHandlerOutcome> {
  const parsed = parsePublishJobPayload(job.payload);
  const { scheduledPostId } = parsed;

  const scheduledPost = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
    include: {
      draft: true,
      platformAccount: true,
      band: true,
      publishedPost: true,
    },
  });

  const existingPublished =
    scheduledPost.publishedPost ??
    (await prisma.publishedPost.findUnique({
      where: { scheduledPostId },
    }));

  if (existingPublished) {
    await reconcileAlreadyPublished(scheduledPost.id, scheduledPost.draftId);
    return "already-published";
  }

  if (scheduledPost.status === "PUBLISHED") {
    throw new Error(
      "Scheduled post is PUBLISHED but no PublishedPost row exists. " +
        "Refusing to call the adapter."
    );
  }

  if (scheduledPost.status !== "SCHEDULED") {
    throw new Error(
      `Refusing to publish: scheduled post status is ${scheduledPost.status}, not SCHEDULED.`
    );
  }

  if (scheduledPost.draft.status !== "SCHEDULED") {
    throw new Error(
      `Refusing to publish: draft status is ${scheduledPost.draft.status}, not SCHEDULED. ` +
        "The reviewed creative and schedule no longer agree."
    );
  }

  if (parsed.adapterWriteStarted) {
    throw new Error(adapterRetryRefusedReason());
  }

  const mediaUrls = sanitizeMediaUrls(scheduledPost.draft.mediaUrls);
  const liveSafety = assertReadyForLivePublish({
    socialAdapterMode: process.env.SOCIAL_ADAPTER ?? "mock",
    platform: scheduledPost.draft.platform,
    accountIsConnected: scheduledPost.platformAccount.isConnected,
    accountIsActive: scheduledPost.platformAccount.isActive,
    mediaUrls,
    accountMetadata: scheduledPost.platformAccount.metadata,
  });
  if (!liveSafety.ok) {
    throw new Error(liveSafety.reason);
  }

  const validation = validateDraftForPlatform(scheduledPost.draft);
  if (!validation.isValid) {
    throw new Error(`Platform validation failed: ${validation.errors.join(", ")}`);
  }

  const adapter = await getSocialAdapter(scheduledPost.draft.platform);
  const degradationWarning = adapter.getDegradationWarning("publish");
  if (degradationWarning) {
    console.warn(`[worker] ${degradationWarning}`);
  }

  // Mark the write attempt before the network call so a crash after a live
  // adapter success cannot retry into a second Facebook/Instagram/YouTube post.
  await prisma.job.update({
    where: { id: job.id },
    data: { payload: withAdapterWriteStarted(job.payload, true) },
  });

  const result = await adapter.publish({
    caption: scheduledPost.draft.caption,
    hashtags: scheduledPost.draft.hashtags,
    mediaUrls,
    scheduledFor: scheduledPost.scheduledFor,
    accountMetadata:
      scheduledPost.platformAccount.metadata != null
        ? (scheduledPost.platformAccount.metadata as Record<string, unknown>)
        : undefined,
  });

  const liveResult = assertLivePublishResult({
    success: result.success,
    isDraftOnly: result.isDraftOnly,
    errorMessage: result.errorMessage,
    externalPostId: result.externalPostId,
  });

  // Keep adapterWriteStarted even when success=false. A Graph 200 without an
  // id, a timeout, or a lost response can still mean a live write landed.

  const publishLog = await prisma.publishLog.create({
    data: {
      platform: scheduledPost.draft.platform,
      adapter: adapter.adapterName,
      success: liveResult.ok,
      responseCode: result.responseCode,
      errorMessage: liveResult.ok ? result.errorMessage : liveResult.reason,
      durationMs: result.durationMs,
    },
  });

  if (!liveResult.ok) {
    throw new Error(liveResult.reason);
  }

  await prisma.$transaction(async (tx) => {
    const publishedPost = await tx.publishedPost.create({
      data: {
        bandId: scheduledPost.bandId,
        scheduledPostId: scheduledPost.id,
        platformAccountId: scheduledPost.platformAccountId,
        platform: scheduledPost.draft.platform,
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
        publishedAt: new Date(),
        caption: scheduledPost.draft.caption,
        hashtags: scheduledPost.draft.hashtags,
      },
    });

    await tx.publishLog.update({
      where: { id: publishLog.id },
      data: { publishedPostId: publishedPost.id },
    });

    await tx.scheduledPost.update({
      where: { id: scheduledPost.id },
      data: { status: "PUBLISHED" },
    });

    await tx.draft.update({
      where: { id: scheduledPost.draftId },
      data: { status: "PUBLISHED" },
    });
  });

  console.log(`[worker] Published post to ${scheduledPost.draft.platform}`);
  return "published";
}
