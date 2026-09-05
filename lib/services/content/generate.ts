"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { evaluateGuardrails, riskLevelFromFlags } from "@/lib/services/guardrails/policy";
import { assertCanGenerateForPlatform, sanitizeMediaUrls } from "@/lib/services/publish/safety";
import { generateContentSchema, type GenerateContentInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";
import { loadGenerationContext } from "./campaign-context-server";
import { CAMPAIGN_CONTEXT_CHANGED, CAMPAIGN_CONTEXT_OFFLINE_ONLY, CAMPAIGN_CONTEXT_TIME_ZONE, CAMPAIGN_CONTEXT_TYPE_MISMATCH } from "./campaign-context";

export async function generateContent(input: GenerateContentInput): Promise<Draft> {
  // The exported service is also a server action boundary; never rely on the UI parser alone.
  input = generateContentSchema.parse(input);
  const generatable = assertCanGenerateForPlatform(input.platform);
  if (!generatable.ok) {
    throw new Error(generatable.reason);
  }

  const { band, linked } = await loadGenerationContext(input);
  if (linked && input.contextReceipt !== linked.receipt) throw new Error(CAMPAIGN_CONTEXT_CHANGED);
  if (linked?.campaignType && input.campaignType !== linked.campaignType) {
    throw new Error(CAMPAIGN_CONTEXT_TYPE_MISMATCH);
  }
  const context = linked ? {
    ...linked.facts,
    ...(input.context?.additionalContext ? { additionalContext: input.context.additionalContext } : {}),
  } : input.context;
  const bandReceipt = JSON.stringify([band.id, band.name, band.updatedAt, band.voiceProfile?.updatedAt ?? null]);

  // Newly linked saved data is not authorized for provider export in this slice.
  // Refuse configured live/unknown modes before provider setup or credential checks.
  if (linked && (process.env.LLM_ADAPTER ?? "mock") !== "mock") {
    throw new Error(CAMPAIGN_CONTEXT_OFFLINE_ONLY);
  }
  const llm = getLlmAdapter();
  // Also check the selected adapter's truth (including an already cached factory).
  if (linked && llm.name !== "mock") {
    throw new Error(CAMPAIGN_CONTEXT_OFFLINE_ONLY);
  }

  const generated = await llm.generateContent({
    band,
    campaignType: input.campaignType,
    platform: input.platform,
    contentLength: input.contentLength,
    toneVariant: input.toneVariant,
    context,
    ...(linked ? { contextSource: "saved-campaign-event" as const } : {}),
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

  // Provider work is complete before the transaction. Recheck the exact facts,
  // then commit all three records together; no partial generation is shown as saved.
  return prisma.$transaction(async (tx) => {
    const current = await loadGenerationContext(input, tx);
    if ((current.linked?.receipt ?? null) !== (linked?.receipt ?? null) ||
        JSON.stringify([current.band.id, current.band.name, current.band.updatedAt,
          current.band.voiceProfile?.updatedAt ?? null]) !== bandReceipt) {
      throw new Error(CAMPAIGN_CONTEXT_CHANGED);
    }

    const run = await tx.generationRun.create({
      data: {
        bandId: band.id,
        campaignType: input.campaignType,
        platform: input.platform,
        inputContext: {
          ...(context ?? {}),
          source: linked ? {
            kind: "saved-campaign-event",
            bandId: band.id,
            campaignId: linked.campaignId,
            eventId: linked.eventId,
            receipt: linked.receipt,
            displayTimeZone: CAMPAIGN_CONTEXT_TIME_ZONE,
          } : { kind: "operator-supplied", bandId: band.id },
        },
        promptSent: `[${llm.name} generation for ${input.campaignType} on ${input.platform}; effective context recorded in inputContext, not a verbatim prompt receipt]`,
        rawResponse: generated.caption,
        llmAdapter: llm.name,
      },
    });

    // Create draft - always IN_REVIEW, never auto-publish
    const draft = await tx.draft.create({
      data: {
        bandId: band.id,
        campaignId: linked?.campaignId ?? null,
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
    await tx.draftVersion.create({
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
  }, { isolationLevel: "Serializable" });
}
