"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { evaluateGuardrails, riskLevelFromFlags } from "@/lib/services/guardrails/policy";
import { deriveHashtags, HASHTAG_DIRECTIVES } from "@/lib/services/content/hashtags";
import type { RewriteDraftInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

export async function rewriteDraft(input: RewriteDraftInput): Promise<Draft> {
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
    include: {
      band: { include: { voiceProfile: true } },
    },
  });

  const llm = getLlmAdapter();

  const newCaption = await llm.rewriteContent({
    originalCaption: draft.caption,
    directive: input.directive,
    band: draft.band as Parameters<typeof llm.rewriteContent>[0]["band"],
    platform: draft.platform,
    additionalInstructions: input.additionalInstructions,
  });

  // Derive updated hashtags based on directive
  const newHashtags = deriveHashtags(draft.hashtags, newCaption, input.directive);

  // Recompute risk: use LLM assessRisk for a fresh signal, then layer hard guardrails
  const riskAssessment = await llm.assessRisk(
    newCaption,
    draft.band as Parameters<typeof llm.assessRisk>[1]
  );
  const otherBands = await prisma.band.findMany({
    where: { id: { not: draft.bandId } },
    select: { name: true },
  });
  const hardViolations = evaluateGuardrails({
    caption: newCaption,
    bandName: draft.band.name,
    otherBandNames: otherBands.map((b) => b.name),
    emojiTolerance: draft.band.voiceProfile?.emojiTolerance,
    isAutoPublish: false,
  });
  const hardFlags = hardViolations.map((v) => v.detail);

  // Merge flags — deduplicate
  const mergedFlags = Array.from(new Set([...riskAssessment.flags, ...hardFlags]));
  const riskLevel = riskLevelFromFlags(mergedFlags.length);
  const brandFitScore = hardFlags.length > 0 ? Math.min(riskAssessment.brandFitScore, 60) : riskAssessment.brandFitScore;

  // Atomically increment version and save — prevents duplicate version numbers
  // under concurrent rewrites
  const updated = await prisma.$transaction(async (tx) => {
    // Re-read inside transaction for consistent version base
    const current = await tx.draft.findUniqueOrThrow({
      where: { id: draft.id },
      select: { currentVersion: true },
    });
    const newVersion = current.currentVersion + 1;

    await tx.draftVersion.create({
      data: {
        draftId: draft.id,
        version: newVersion,
        caption: newCaption,
        hashtags: newHashtags,
        ctaText: draft.ctaText ?? undefined,
        rewriteDirective: input.directive,
        changeNotes: input.additionalInstructions,
      },
    });

    return tx.draft.update({
      where: { id: draft.id },
      data: {
        caption: newCaption,
        hashtags: HASHTAG_DIRECTIVES.has(input.directive) ? newHashtags : draft.hashtags,
        riskFlags: mergedFlags,
        riskLevel,
        brandFitScore,
        confidenceNotes: riskAssessment.confidenceNotes,
        currentVersion: newVersion,
        status: "IN_REVIEW",
      },
    });
  });

  return updated;
}
