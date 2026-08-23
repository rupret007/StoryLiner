import { prisma } from "@/lib/prisma";
import { getSocialAdapter } from "@/lib/adapters/social";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import {
  assertLivePublishResult,
  assertReadyForLivePublish,
  sanitizeMediaUrls,
} from "@/lib/services/publish/safety";
import type { Job } from "@prisma/client";

export async function handlePublishPost(job: Job): Promise<void> {
  const payload = job.payload as { scheduledPostId: string };
  const { scheduledPostId } = payload;

  const scheduledPost = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
    include: {
      draft: true,
      platformAccount: true,
      band: true,
    },
  });

  if (scheduledPost.status !== "SCHEDULED") {
    console.log(`[worker] Skipping ${scheduledPostId}: status is ${scheduledPost.status}`);
    return;
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

  const result = await adapter.publish({
    caption: scheduledPost.draft.caption,
    hashtags: scheduledPost.draft.hashtags,
    mediaUrls,
    scheduledFor: scheduledPost.scheduledFor,
    // Forward platform-account metadata so real adapters can resolve the correct
    // account ID (e.g. Facebook page ID, Instagram user ID, YouTube channel ID).
    accountMetadata:
      scheduledPost.platformAccount.metadata != null
        ? (scheduledPost.platformAccount.metadata as Record<string, unknown>)
        : undefined,
  });

  const liveResult = assertLivePublishResult({
    success: result.success,
    isDraftOnly: result.isDraftOnly,
    errorMessage: result.errorMessage,
  });

  // Record publish log. Draft-only / failed writes stay failed — never "published".
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

  // Create published post record for fully published content
  const publishedPost = await prisma.publishedPost.create({
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

  // Link publish log to published post
  await prisma.publishLog.update({
    where: { id: publishLog.id },
    data: { publishedPostId: publishedPost.id },
  });

  // Mark as fully published
  await prisma.scheduledPost.update({
    where: { id: scheduledPost.id },
    data: { status: "PUBLISHED" },
  });

  await prisma.draft.update({
    where: { id: scheduledPost.draftId },
    data: { status: "PUBLISHED" },
  });

  console.log(`[worker] Published post ${publishedPost.id} to ${scheduledPost.draft.platform}`);
}
