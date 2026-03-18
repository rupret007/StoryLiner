import { prisma } from "@/lib/prisma";
import { getSocialAdapter } from "@/lib/adapters/social";
import { validateDraftForPlatform } from "@/lib/services/publish/validate";
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

  const validation = validateDraftForPlatform(scheduledPost.draft);
  if (!validation.isValid) {
    throw new Error(`Platform validation failed: ${validation.errors.join(", ")}`);
  }

  const adapter = getSocialAdapter(scheduledPost.draft.platform);
  const degradationWarning = adapter.getDegradationWarning("publish");
  if (degradationWarning) {
    console.warn(`[worker] ${degradationWarning}`);
  }

  const result = await adapter.publish({
    caption: scheduledPost.draft.caption,
    hashtags: scheduledPost.draft.hashtags,
    scheduledFor: scheduledPost.scheduledFor,
    // Forward platform-account metadata so real adapters can resolve the correct
    // account ID (e.g. Facebook page ID, Instagram user ID, YouTube channel ID).
    accountMetadata:
      scheduledPost.platformAccount.metadata != null
        ? (scheduledPost.platformAccount.metadata as Record<string, unknown>)
        : undefined,
  });

  // Record publish log
  const publishLog = await prisma.publishLog.create({
    data: {
      platform: scheduledPost.draft.platform,
      adapter: adapter.adapterName,
      success: result.success,
      responseCode: result.responseCode,
      errorMessage: result.isDraftOnly
        ? `Submitted as platform draft — manual publish required. Draft URL: ${result.externalPostUrl ?? "n/a"}`
        : result.errorMessage,
      durationMs: result.durationMs,
    },
  });

  if (!result.success) {
    throw new Error(result.errorMessage ?? "Publish failed with unknown error");
  }

  if (result.isDraftOnly) {
    // Platform only supports draft submission (e.g. TikTok). The content is in
    // the platform's draft queue but is NOT live yet. Keep draft in APPROVED so
    // the operator knows manual action is still needed.
    await prisma.scheduledPost.update({
      where: { id: scheduledPost.id },
      data: { status: "PUBLISHED" }, // job completed successfully — post was submitted
    });

    await prisma.draft.update({
      where: { id: scheduledPost.draftId },
      data: {
        status: "APPROVED", // intentionally NOT published — needs manual publish
        reviewNotes: `Submitted to ${scheduledPost.draft.platform} draft queue on ${new Date().toISOString()}. Manual publish required.`,
      },
    });

    console.log(
      `[worker] Submitted post to ${scheduledPost.draft.platform} draft queue (not live). Manual publish required.`
    );
    return;
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
