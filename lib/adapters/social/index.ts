import type { Platform } from "@prisma/client";
import {
  allMockAdapters,
  createDraftOnlyFallbackAdapter,
  refusedTwitterAdapter,
} from "./mock-adapter";
import type { SocialProviderAdapter } from "./base";

/**
 * Supported real adapter platforms.
 * Bluesky, TikTok, and Twitch stay draft-only fallbacks — no live write.
 * Twitter/X is schema leftover and is refused in both mock and real.
 */
const REAL_ADAPTER_PLATFORMS = new Set<Platform>(["FACEBOOK", "INSTAGRAM", "YOUTUBE"]);

function unsupportedRealFallback(platform: Platform): SocialProviderAdapter {
  console.warn(
    `[SocialAdapter] No real adapter for ${platform}. ` +
      "Returning draft-only fallback so StoryLiner will not mark a mock write as live."
  );
  return createDraftOnlyFallbackAdapter(
    platform,
    `real-fallback-draft-only-${platform.toLowerCase()}`
  );
}

export async function getSocialAdapter(platform: Platform): Promise<SocialProviderAdapter> {
  if (platform === "TWITTER") {
    return refusedTwitterAdapter;
  }

  const mode = process.env.SOCIAL_ADAPTER ?? "mock";

  if (mode === "mock") {
    const adapter = allMockAdapters[platform];
    if (!adapter) {
      throw new Error(`No mock adapter available for platform: ${platform}`);
    }
    return adapter;
  }

  if (mode === "real") {
    if (!REAL_ADAPTER_PLATFORMS.has(platform)) {
      return unsupportedRealFallback(platform);
    }

    switch (platform) {
      case "FACEBOOK": {
        const { FacebookRealAdapter } = await import("./real/facebook-adapter");
        return new FacebookRealAdapter();
      }
      case "INSTAGRAM": {
        const { InstagramRealAdapter } = await import("./real/instagram-adapter");
        return new InstagramRealAdapter();
      }
      case "YOUTUBE": {
        const { YouTubeRealAdapter } = await import("./real/youtube-adapter");
        return new YouTubeRealAdapter();
      }
      default:
        return unsupportedRealFallback(platform);
    }
  }

  throw new Error(
    `Unknown SOCIAL_ADAPTER mode: "${mode}". Use "mock" or "real".`
  );
}

export type {
  SocialProviderAdapter,
  PublishPayload,
  PublishResult,
  SocialAdapterCapabilities,
} from "./base";
