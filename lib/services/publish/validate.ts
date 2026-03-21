import type { Draft, Platform } from "@prisma/client";
import { getSocialAdapter } from "../../adapters/social";

export interface PlatformValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const PLATFORM_LIMITS: Record<Platform, { captionMax: number; hashtagMax: number }> = {
  FACEBOOK: { captionMax: 63206, hashtagMax: 30 },
  INSTAGRAM: { captionMax: 2200, hashtagMax: 30 },
  BLUESKY: { captionMax: 300, hashtagMax: 10 },
  TIKTOK: { captionMax: 2200, hashtagMax: 20 },
  YOUTUBE: { captionMax: 5000, hashtagMax: 15 },
  TWITCH: { captionMax: 140, hashtagMax: 5 },
  TWITTER: { captionMax: 280, hashtagMax: 5 },
};

export function validateDraftForPlatform(
  draft: Draft,
  isScheduled: boolean = false
): PlatformValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const limits = PLATFORM_LIMITS[draft.platform];

  if (!limits) {
    errors.push(`Unknown platform: ${draft.platform}`);
    return { isValid: false, errors, warnings };
  }

  // Scheduling Guard: Check if platform supports scheduling
  if (isScheduled) {
    const adapter = getSocialAdapter(draft.platform);
    if (!adapter.capabilities.canSchedule) {
      if (draft.platform === "INSTAGRAM") {
        errors.push(
          "Instagram doesn't support scheduling via API. Post now or use Facebook/Meta Business Suite for scheduling."
        );
      } else {
        errors.push(
          `${draft.platform} doesn't support scheduling via API. Please post now instead.`
        );
      }
    }
  }

  const fullText = draft.caption + (draft.hashtags.length ? " " + draft.hashtags.join(" ") : "");

  if (fullText.length > limits.captionMax) {
    errors.push(
      `Content exceeds ${draft.platform} character limit (${fullText.length}/${limits.captionMax})`
    );
  }

  if (draft.hashtags.length > limits.hashtagMax) {
    warnings.push(
      `${draft.hashtags.length} hashtags. ${draft.platform} recommends max ${limits.hashtagMax}`
    );
  }

  if (draft.riskLevel === "HIGH") {
    warnings.push("High risk flags detected. Review before publishing.");
  }

  if (draft.brandFitScore !== null && draft.brandFitScore < 60) {
    warnings.push(`Low brand fit score (${draft.brandFitScore}/100). Consider rewriting.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
