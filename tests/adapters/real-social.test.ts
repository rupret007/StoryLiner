/**
 * Contract tests for the real social adapters (Facebook, Instagram, YouTube).
 *
 * These tests verify:
 *   1. Capability declarations match expected API realities
 *   2. isDraftOnly is returned correctly for text-only / media-required paths
 *   3. validateCredentials() returns false when env vars are missing (no live calls)
 *   4. publish() returns a valid PublishResult shape even in error/draft paths
 *   5. The adapter factory wires real adapters when SOCIAL_ADAPTER=real
 *
 * Live network calls are skipped by default (no real credentials in CI).
 * To run live tests, set env vars in .env.local and pass --testNamePattern="live:"
 */

import { FacebookRealAdapter } from "@/lib/adapters/social/real/facebook-adapter";
import { InstagramRealAdapter } from "@/lib/adapters/social/real/instagram-adapter";
import { YouTubeRealAdapter } from "@/lib/adapters/social/real/youtube-adapter";

// ─── Facebook ─────────────────────────────────────────────────────────────────

describe("FacebookRealAdapter — capability declarations", () => {
  const adapter = new FacebookRealAdapter();

  it("declares platform as FACEBOOK", () => {
    expect(adapter.platform).toBe("FACEBOOK");
  });

  it("adapter name identifies as real", () => {
    expect(adapter.adapterName).toBe("real-facebook");
  });

  it("canDirectPublish is true", () => {
    expect(adapter.capabilities.canDirectPublish).toBe(true);
  });

  it("canDraftOnly is false (Facebook supports direct publish)", () => {
    expect(adapter.capabilities.canDraftOnly).toBe(false);
  });

  it("canSchedule is true (Graph API supports scheduled posts)", () => {
    expect(adapter.capabilities.canSchedule).toBe(true);
  });

  it("maxCaptionLength is 63206", () => {
    expect(adapter.capabilities.maxCaptionLength).toBe(63206);
  });

  it("no degradation warning for publish action", () => {
    expect(adapter.getDegradationWarning("publish")).toBeNull();
  });

  it("no degradation warning for schedule action", () => {
    expect(adapter.getDegradationWarning("schedule")).toBeNull();
  });
});

describe("FacebookRealAdapter — credential validation without env vars", () => {
  const adapter = new FacebookRealAdapter();

  it("validateCredentials returns false when env vars are missing", async () => {
    const savedToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const savedPageId = process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.FACEBOOK_PAGE_ID;

    const result = await adapter.validateCredentials();
    expect(result).toBe(false);

    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = savedToken;
    process.env.FACEBOOK_PAGE_ID = savedPageId;
  });
});

describe("FacebookRealAdapter — publish() shape when credentials missing", () => {
  const adapter = new FacebookRealAdapter();

  it("returns a valid PublishResult shape even on credential error", async () => {
    const savedToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    const result = await adapter.publish({ caption: "Test", hashtags: [] });

    expect(result).toMatchObject({
      success: false,
      isDraftOnly: false,
      durationMs: expect.any(Number),
      errorMessage: expect.any(String),
    });

    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = savedToken;
  });
});

// ─── Instagram ────────────────────────────────────────────────────────────────

describe("InstagramRealAdapter — capability declarations", () => {
  const adapter = new InstagramRealAdapter();

  it("declares platform as INSTAGRAM", () => {
    expect(adapter.platform).toBe("INSTAGRAM");
  });

  it("adapter name identifies as real", () => {
    expect(adapter.adapterName).toBe("real-instagram");
  });

  it("canDirectPublish is true when media is provided", () => {
    expect(adapter.capabilities.canDirectPublish).toBe(true);
  });

  it("canDraftOnly is false (Instagram posts are live once published)", () => {
    expect(adapter.capabilities.canDraftOnly).toBe(false);
  });

  it("maxCaptionLength is 2200", () => {
    expect(adapter.capabilities.maxCaptionLength).toBe(2200);
  });

  it("canSchedule is false (no native scheduling in Content Publishing API)", () => {
    expect(adapter.capabilities.canSchedule).toBe(false);
  });
});

describe("InstagramRealAdapter — isDraftOnly when no media provided", () => {
  const adapter = new InstagramRealAdapter();

  it("returns isDraftOnly=true when no mediaUrls are provided", async () => {
    const result = await adapter.publish({
      caption: "Come to our show Friday.",
      hashtags: ["#bandlife"],
      // No mediaUrls — Instagram requires media for feed posts
    });

    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns isDraftOnly=true when mediaUrls is empty array", async () => {
    const result = await adapter.publish({
      caption: "Playing tonight.",
      hashtags: [],
      mediaUrls: [],
    });

    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(true);
  });
});

describe("InstagramRealAdapter — credential validation without env vars", () => {
  const adapter = new InstagramRealAdapter();

  it("validateCredentials returns false when env vars are missing", async () => {
    const savedToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const savedIgId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    const result = await adapter.validateCredentials();
    expect(result).toBe(false);

    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = savedToken;
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = savedIgId;
  });
});

// ─── YouTube ──────────────────────────────────────────────────────────────────

describe("YouTubeRealAdapter — capability declarations", () => {
  const adapter = new YouTubeRealAdapter();

  it("declares platform as YOUTUBE", () => {
    expect(adapter.platform).toBe("YOUTUBE");
  });

  it("adapter name identifies as real", () => {
    expect(adapter.adapterName).toBe("real-youtube");
  });

  it("canDirectPublish is false (community post API removed in 2023)", () => {
    expect(adapter.capabilities.canDirectPublish).toBe(false);
  });

  it("canDraftOnly is true (content is surfaced for manual posting)", () => {
    expect(adapter.capabilities.canDraftOnly).toBe(true);
  });

  it("degradation warning is present for publish action", () => {
    const warning = adapter.getDegradationWarning("publish");
    expect(warning).not.toBeNull();
    expect(warning?.toLowerCase()).toContain("draft");
  });

  it("maxCaptionLength is 5000", () => {
    expect(adapter.capabilities.maxCaptionLength).toBe(5000);
  });
});

describe("YouTubeRealAdapter — text-only publish returns isDraftOnly", () => {
  const adapter = new YouTubeRealAdapter();

  it("returns isDraftOnly=true for text-only posts (no video URL)", async () => {
    const result = await adapter.publish({
      caption: "Stream tonight at 8pm.",
      hashtags: ["#livestream"],
      // No mediaUrls — no YouTube API for text community posts
    });

    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // externalPostUrl should point operator toward YouTube Studio
    expect(result.externalPostUrl).toContain("studio.youtube.com");
  });

  it("returns isDraftOnly=true when non-YouTube media URL is provided", async () => {
    const result = await adapter.publish({
      caption: "Check this out.",
      hashtags: [],
      mediaUrls: ["https://example.com/image.jpg"],
    });

    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(true);
  });
});

describe("YouTubeRealAdapter — credential validation without env vars", () => {
  const adapter = new YouTubeRealAdapter();

  it("validateCredentials returns false when env vars are missing", async () => {
    const savedClient = process.env.YOUTUBE_CLIENT_ID;
    const savedSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const savedToken = process.env.YOUTUBE_REFRESH_TOKEN;

    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.YOUTUBE_REFRESH_TOKEN;

    const result = await adapter.validateCredentials();
    expect(result).toBe(false);

    process.env.YOUTUBE_CLIENT_ID = savedClient;
    process.env.YOUTUBE_CLIENT_SECRET = savedSecret;
    process.env.YOUTUBE_REFRESH_TOKEN = savedToken;
  });
});

describe("YouTubeRealAdapter — deletePost is intentionally a no-op", () => {
  const adapter = new YouTubeRealAdapter();

  it("deletePost returns false (video lifecycle managed in YouTube Studio)", async () => {
    const result = await adapter.deletePost("someVideoId");
    expect(result).toBe(false);
  });
});

// ─── Adapter factory ──────────────────────────────────────────────────────────

describe("getSocialAdapter — real mode wiring", () => {
  it("returns real adapters for FB/IG/YT when SOCIAL_ADAPTER=real", () => {
    const saved = process.env.SOCIAL_ADAPTER;
    process.env.SOCIAL_ADAPTER = "real";

    const { getSocialAdapter } = require("@/lib/adapters/social/index");

    const fb = getSocialAdapter("FACEBOOK");
    expect(fb.adapterName).toBe("real-facebook");

    const ig = getSocialAdapter("INSTAGRAM");
    expect(ig.adapterName).toBe("real-instagram");

    const yt = getSocialAdapter("YOUTUBE");
    expect(yt.adapterName).toBe("real-youtube");

    process.env.SOCIAL_ADAPTER = saved;
    jest.resetModules();
  });

  it("falls back to mock for unsupported real platforms", () => {
    const saved = process.env.SOCIAL_ADAPTER;
    process.env.SOCIAL_ADAPTER = "real";

    const { getSocialAdapter } = require("@/lib/adapters/social/index");

    const bluesky = getSocialAdapter("BLUESKY");
    expect(bluesky.adapterName).toBe("mock-bluesky");

    process.env.SOCIAL_ADAPTER = saved;
    jest.resetModules();
  });

  it("returns mock adapters when SOCIAL_ADAPTER=mock (default)", () => {
    const saved = process.env.SOCIAL_ADAPTER;
    process.env.SOCIAL_ADAPTER = "mock";

    const { getSocialAdapter } = require("@/lib/adapters/social/index");

    const fb = getSocialAdapter("FACEBOOK");
    expect(fb.adapterName).toBe("mock-facebook");

    process.env.SOCIAL_ADAPTER = saved;
    jest.resetModules();
  });
});
