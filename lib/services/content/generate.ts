"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { evaluateGuardrails, riskLevelFromFlags } from "@/lib/services/guardrails/policy";
import { assertCanGenerateForPlatform, sanitizeMediaUrls } from "@/lib/services/publish/safety";
import type { GenerateContentInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

export async function generateContent(input: GenerateContentInput): Promise<Draft> {
  const generatable = assertCanGenerateForPlatform(input.platform);
  if (!generatable.ok) {
    throw new Error(generatable.reason);
  }

  const band = await prisma.band.findUniqueOrThrow({
    where: { id: input.bandId },
    include: { voiceProfile: true },
  });

  const llm = getLlmAdapter();

  const generated = await llm.generateContent({
    band,
    campaignType: input.campaignType,
    platform: input.platform,
    contentLength: input.contentLength,
    toneVariant: input.toneVariant,
    context: input.context,
  });

  const otherBands = await prisma.band.findMany({
    where: { id: { not: band.id } },
    select: { name: true },
  });

  // Hard guardrails always run. Auto-publish is explicitly false — drafts stay IN_REVIEW.
  const violations = evaluateGuardrails({
    caption: generated.caption,
    bandName: band.name,
    otherBandNames: otherBands.map((b) => b.name),
    emojiTolerance: band.voiceProfile?.emojiTolerance,
    isAutoPublish: false,
  });
  const additionalFlags = violations.map((v) => v.detail);
  const allFlags = [...generated.riskFlags, ...additionalFlags];

  // Record the generation run
  const run = await prisma.generationRun.create({
    data: {
      bandId: band.id,
      campaignType: input.campaignType,
      platform: input.platform,
      inputContext: (input.context ?? {}) as object,
      promptSent: `[mock prompt for ${input.campaignType} on ${input.platform}]`,
      rawResponse: generated.caption,
      llmAdapter: llm.name,
    },
  });

  // Create draft - always IN_REVIEW, never auto-publish
  const draft = await prisma.draft.create({
    data: {
      bandId: band.id,
      campaignId: input.campaignId,
      platform: input.platform,
      status: "IN_REVIEW",
      toneVariant: input.toneVariant ?? (band.voiceProfile?.defaultTone ?? "AUTHENTIC"),
      contentLength: input.contentLength,
      caption: generated.caption,
      hashtags: generated.hashtags,
      mediaUrls: sanitizeMediaUrls(input.mediaUrls),
      ctaText: generated.ctaText,
      altText: generated.altText,
      imagePrompt: generated.imagePrompt,
      fanReplies: generated.fanReplies,
      brandFitScore: generated.brandFitScore,
      confidenceNotes: generated.confidenceNotes,
      riskLevel: riskLevelFromFlags(allFlags.length),
      riskFlags: allFlags,
      generationRunId: run.id,
      currentVersion: 1,
    },
  });

  // Create initial version history entry
  await prisma.draftVersion.create({
    data: {
      draftId: draft.id,
      version: 1,
      caption: generated.caption,
      hashtags: generated.hashtags,
      ctaText: generated.ctaText,
      changeNotes: "Initial generation",
    },
  });

  return draft;
}
