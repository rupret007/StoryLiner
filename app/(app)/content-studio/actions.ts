"use server";

import { generateContent } from "@/lib/services/content/generate";
import { generateContentSchema } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";
import {
  CAMPAIGN_CONTEXT_CHANGED,
  CAMPAIGN_CONTEXT_UNAVAILABLE,
  CAMPAIGN_CONTEXT_OFFLINE_ONLY,
  CAMPAIGN_CONTEXT_TYPE_MISMATCH,
  type StudioGenerationResult,
  type StudioGenerationBlockedCode,
} from "@/lib/services/content/campaign-context";

export async function generateContentAction(
  input: Parameters<typeof generateContent>[0]
): Promise<Draft> {
  const parsed = generateContentSchema.parse(input);
  return generateContent(parsed);
}

/**
 * Expected refusals must be data: production React Flight redacts thrown errors.
 * Unknown failures remain unconfirmed, without leaking database/provider details.
 * The legacy Draft-returning action above keeps its existing service contract.
 */
export async function generateStudioDraftAction(
  input: Parameters<typeof generateContent>[0],
): Promise<StudioGenerationResult> {
  const parsed = generateContentSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  try {
    const draft = await generateContent(parsed.data);
    return { status: "saved", draft };
  } catch (error) {
    const known: ReadonlyMap<string, StudioGenerationBlockedCode> = new Map([
      [CAMPAIGN_CONTEXT_CHANGED, "context_changed"],
      [CAMPAIGN_CONTEXT_UNAVAILABLE, "context_unavailable"],
      [CAMPAIGN_CONTEXT_OFFLINE_ONLY, "offline_only"],
      [CAMPAIGN_CONTEXT_TYPE_MISMATCH, "type_mismatch"],
    ]);
    const code = error instanceof Error ? known.get(error.message) : undefined;
    return code ? { status: "blocked", code } : { status: "unconfirmed" };
  }
}
