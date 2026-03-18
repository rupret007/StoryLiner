import type { Platform } from "@prisma/client";
import { mockYoutubeLiveAdapter, mockTwitchLiveAdapter } from "./mock-adapter";
import type { LivestreamProviderAdapter } from "./base";

const mockAdapters: Partial<Record<Platform, LivestreamProviderAdapter>> = {
  YOUTUBE: mockYoutubeLiveAdapter,
  TWITCH: mockTwitchLiveAdapter,
};

export function getLivestreamAdapter(platform: Platform): LivestreamProviderAdapter | null {
  const mode = process.env.SOCIAL_ADAPTER ?? "mock";

  if (mode === "mock") {
    return mockAdapters[platform] ?? null;
  }

  throw new Error(
    `Real livestream adapter for ${platform} is not implemented. Set SOCIAL_ADAPTER=mock.`
  );
}

export type { LivestreamProviderAdapter, StreamDestinationConfig, StreamStartResult } from "./base";
