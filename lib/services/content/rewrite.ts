"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { checkHardGuardrails } from "@/lib/services/guardrails/policy";
import type { RewriteDraftInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

/** Directives that affect the hashtag array, not just the caption text. */
const HASHTAG_DIRECTIVES = new Set(["noHashtags", "shorterHashtags"]);

/**
 * Derive updated hashtags based on the directive applied.
 * Keeps existing hashtags unless the directive explicitly changes them.
 */
function deriveHashtags(
  existingHashtags: string[],
  newCaption: string,
  directive: string
): string[] {
  if (directive === "noHashtags") {
    return [];
  }
  if (directive === "shorterHashtags") {
    // Remove any hashtags longer than 14 characters
    return existingHashtags.filter((h) => h.length <= 14);
  }
  // For non-hashtag directives, keep existing hashtags (they weren't rewritten)
  return existingHashtags;
}

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
  const hardViolations = checkHardGuardrails(newCaption);
  const hardFlags = hardViolations.map((v) => v.detail);

  // Merge flags — deduplicate
  const mergedFlags = Array.from(new Set([...riskAssessment.flags, ...hardFlags]));
  const riskLevel =
    mergedFlags.length === 0 ? "LOW" : mergedFlags.length <= 2 ? "MEDIUM" : "HIGH";
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
