import type { Platform } from "@prisma/client";
import { allMockAdapters } from "./mock-adapter";
import type { SocialProviderAdapter } from "./base";

/**
 * Supported real adapter platforms for this sprint.
 * Bluesky, TikTok, and Twitch remain mock-only until their adapters are implemented.
 */
const REAL_ADAPTER_PLATFORMS = new Set<Platform>(["FACEBOOK", "INSTAGRAM", "YOUTUBE"]);

export function getSocialAdapter(platform: Platform): SocialProviderAdapter {
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
      console.warn(
        `[SocialAdapter] No real adapter yet for ${platform}. ` +
          "Falling back to mock adapter. Set SOCIAL_ADAPTER=mock to suppress this warning."
      );
      return allMockAdapters[platform];
    }

    // Lazy-load real adapters to avoid importing platform SDKs in mock-only environments
    switch (platform) {
      case "FACEBOOK": {
        const { FacebookRealAdapter } = require("./real/facebook-adapter") as typeof import("./real/facebook-adapter");
        return new FacebookRealAdapter();
      }
      case "INSTAGRAM": {
        const { InstagramRealAdapter } = require("./real/instagram-adapter") as typeof import("./real/instagram-adapter");
        return new InstagramRealAdapter();
      }
      case "YOUTUBE": {
        const { YouTubeRealAdapter } = require("./real/youtube-adapter") as typeof import("./real/youtube-adapter");
        return new YouTubeRealAdapter();
      }
      default:
        return allMockAdapters[platform];
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
