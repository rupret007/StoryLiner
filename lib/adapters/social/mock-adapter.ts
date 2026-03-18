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

export const allMockAdapters: Record<Platform, SocialProviderAdapter> = {
  FACEBOOK: mockFacebookAdapter,
  INSTAGRAM: mockInstagramAdapter,
  BLUESKY: mockBlueskyAdapter,
  TIKTOK: mockTikTokAdapter,
  YOUTUBE: mockYouTubeAdapter,
  TWITCH: mockTwitchAdapter,
  TWITTER: mockFacebookAdapter, // fallback
};
