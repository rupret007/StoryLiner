import type { Platform } from "@prisma/client";
import {
  SocialProviderAdapter,
  type PublishPayload,
  type PublishResult,
  type SocialAdapterCapabilities,
} from "./base";

function mockDelay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeExternalId(platform: string): string {
  return `mock_${platform.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class MockSocialAdapter extends SocialProviderAdapter {
  constructor(
    public readonly platform: Platform,
    public readonly capabilities: SocialAdapterCapabilities,
    public readonly adapterName: string
  ) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const start = Date.now();
    await mockDelay(150);

    if (this.capabilities.canDraftOnly) {
      const id = makeExternalId(this.platform);
      return {
        success: true,
        isDraftOnly: true,
        externalPostId: id,
        externalPostUrl: `https://mock-${this.platform.toLowerCase()}.example.com/draft/${id}`,
        responseCode: 200,
        durationMs: Date.now() - start,
      };
    }

    const id = makeExternalId(this.platform);
    return {
      success: true,
      isDraftOnly: false,
      externalPostId: id,
      externalPostUrl: `https://mock-${this.platform.toLowerCase()}.example.com/posts/${id}`,
      responseCode: 200,
      durationMs: Date.now() - start,
    };
  }

  async deletePost(externalPostId: string): Promise<boolean> {
    await mockDelay(100);
    console.log(`[mock] Deleted post ${externalPostId} from ${this.platform}`);
    return true;
  }

  async validateCredentials(): Promise<boolean> {
    await mockDelay(50);
    return true;
  }
}

// Platform-specific mock instances with realistic capability profiles

export const mockFacebookAdapter = new MockSocialAdapter(
  "FACEBOOK",
  {
    canDirectPublish: true,
    canSchedule: true,
    canDraftOnly: false,
    canDeletePost: true,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 63206,
    maxHashtags: 30,
  },
  "mock-facebook"
);

export const mockInstagramAdapter = new MockSocialAdapter(
  "INSTAGRAM",
  {
    canDirectPublish: true,
    canSchedule: true,
    canDraftOnly: false,
    canDeletePost: true,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 2200,
    maxHashtags: 30,
  },
  "mock-instagram"
);

export const mockBlueskyAdapter = new MockSocialAdapter(
  "BLUESKY",
  {
    canDirectPublish: true,
    canSchedule: false,
    canDraftOnly: false,
    canDeletePost: true,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 300,
    maxHashtags: 10,
  },
  "mock-bluesky"
);

export const mockTikTokAdapter = new MockSocialAdapter(
  "TIKTOK",
  {
    canDirectPublish: false,  // TikTok API requires video content; text posts go to draft
    canSchedule: false,
    canDraftOnly: true,
    canDeletePost: false,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 2200,
    maxHashtags: 20,
  },
  "mock-tiktok"
);

export const mockYouTubeAdapter = new MockSocialAdapter(
  "YOUTUBE",
  {
    canDirectPublish: true,  // Description/metadata only in MVP
    canSchedule: true,
    canDraftOnly: false,
    canDeletePost: false,
    supportsMedia: false,
    supportsHashtags: true,
    maxCaptionLength: 5000,
    maxHashtags: 15,
  },
  "mock-youtube"
);

export const mockTwitchAdapter = new MockSocialAdapter(
  "TWITCH",
  {
    canDirectPublish: false,  // Twitch has no post API; clips/announcements only
    canSchedule: false,
    canDraftOnly: true,
    canDeletePost: false,
    supportsMedia: false,
    supportsHashtags: false,
    maxCaptionLength: 140,
    maxHashtags: 5,
  },
  "mock-twitch"
);

/**
 * X/Twitter is schema leftover only. This is not a real X adapter and must
 * never look like a successful tweet — not even a mock Facebook publish.
 */
class RefusedTwitterAdapter extends SocialProviderAdapter {
  readonly platform: Platform = "TWITTER";
  readonly adapterName = "refused-twitter";
  readonly capabilities: SocialAdapterCapabilities = {
    canDirectPublish: false,
    canSchedule: false,
    canDraftOnly: true,
    canDeletePost: false,
    supportsMedia: false,
    supportsHashtags: true,
    maxCaptionLength: 280,
    maxHashtags: 5,
  };

  getDegradationWarning(_action: "publish" | "schedule" | "delete"): string {
    return "Twitter/X is schema leftover. No real X adapter. StoryLiner will not publish a tweet.";
  }

  async publish(_payload: PublishPayload): Promise<PublishResult> {
    return {
      success: false,
      isDraftOnly: true,
      errorMessage:
        "Twitter/X is schema leftover. No real X adapter. StoryLiner did not publish a tweet.",
      durationMs: 0,
    };
  }

  async deletePost(_externalPostId: string): Promise<boolean> {
    return false;
  }

  async validateCredentials(): Promise<boolean> {
    return false;
  }
}

export const refusedTwitterAdapter = new RefusedTwitterAdapter();
/** @deprecated Use refusedTwitterAdapter. Kept so existing imports keep working. */
export const mockTwitterAdapter = refusedTwitterAdapter;

/** Used when SOCIAL_ADAPTER=real but the platform has no real write adapter. */
export function createDraftOnlyFallbackAdapter(
  platform: Platform,
  adapterName: string
): SocialProviderAdapter {
  return new MockSocialAdapter(
    platform,
    {
      canDirectPublish: false,
      canSchedule: false,
      canDraftOnly: true,
      canDeletePost: false,
      supportsMedia: false,
      supportsHashtags: true,
      maxCaptionLength: 500,
      maxHashtags: 10,
    },
    adapterName
  );
}

export const allMockAdapters: Record<Platform, SocialProviderAdapter> = {
  FACEBOOK: mockFacebookAdapter,
  INSTAGRAM: mockInstagramAdapter,
  BLUESKY: mockBlueskyAdapter,
  TIKTOK: mockTikTokAdapter,
  YOUTUBE: mockYouTubeAdapter,
  TWITCH: mockTwitchAdapter,
  TWITTER: refusedTwitterAdapter,
};
