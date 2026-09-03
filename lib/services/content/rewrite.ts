"use server";

import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import { evaluateGuardrails, riskLevelFromFlags } from "@/lib/services/guardrails/policy";
import { deriveHashtags, HASHTAG_DIRECTIVES } from "@/lib/services/content/hashtags";
import { assertCanMutateDraftCaption } from "@/lib/services/publish/safety";
import {
  REVIEW_SNAPSHOT_RACE,
  assertReviewSnapshotMatches,
  parseReviewSnapshotReceipt,
  reviewSnapshotWhere,
} from "@/lib/services/publish/review-snapshot";
import type { RewriteDraftInput } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

export async function rewriteDraft(input: RewriteDraftInput): Promise<Draft> {
  const receipt = parseReviewSnapshotReceipt(input.reviewedSnapshot);
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: input.draftId },
    include: {
      band: { include: { voiceProfile: true } },
    },
  });

  assertReviewSnapshotMatches(draft, receipt);

  const mutable = assertCanMutateDraftCaption({ status: draft.status });
  if (!mutable.ok) {
    throw new Error(mutable.reason);
  }

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

  // Bind the rewrite to the card Jeff saw, then compare-and-set so a
  // concurrent Schedule / edit cannot keep this new caption on a live path.
  // reviewedAt is cleared — this is unseen creative until the next yes.
  const updated = await prisma.$transaction(async (tx) => {
    const newVersion = draft.currentVersion + 1;

    const moved = await tx.draft.updateMany({
      where: reviewSnapshotWhere(draft.id, draft.status, receipt.updatedAt),
      data: {
        caption: newCaption,
        hashtags: HASHTAG_DIRECTIVES.has(input.directive) ? newHashtags : draft.hashtags,
        riskFlags: mergedFlags,
        riskLevel,
        brandFitScore,
        confidenceNotes: riskAssessment.confidenceNotes,
        currentVersion: newVersion,
        status: "IN_REVIEW",
        reviewedAt: null,
      },
    });
    if (moved.count === 0) {
      throw new Error(REVIEW_SNAPSHOT_RACE);
    }

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

    return tx.draft.findUniqueOrThrow({ where: { id: draft.id } });
  });

  return updated;
}
