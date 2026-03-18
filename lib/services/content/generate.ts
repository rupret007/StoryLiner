"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { checkHardGuardrails } from "@/lib/services/guardrails/policy";
import type { GenerateContentInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

export async function generateContent(input: GenerateContentInput): Promise<Draft> {
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

  // Run hard guardrails
  const violations = checkHardGuardrails(generated.caption);
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
      ctaText: generated.ctaText,
      altText: generated.altText,
      imagePrompt: generated.imagePrompt,
      fanReplies: generated.fanReplies,
      brandFitScore: generated.brandFitScore,
      confidenceNotes: generated.confidenceNotes,
      riskLevel: allFlags.length === 0 ? "LOW" : allFlags.length <= 2 ? "MEDIUM" : "HIGH",
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
