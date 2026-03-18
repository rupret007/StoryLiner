import { allMockAdapters } from "@/lib/adapters/social/mock-adapter";

describe("Social Provider Mock Adapters", () => {
  describe("capability declarations", () => {
    it("Facebook adapter supports direct publish", () => {
      expect(allMockAdapters.FACEBOOK.capabilities.canDirectPublish).toBe(true);
    });

    it("Instagram adapter supports direct publish", () => {
      expect(allMockAdapters.INSTAGRAM.capabilities.canDirectPublish).toBe(true);
    });

    it("TikTok adapter is draft-only", () => {
      expect(allMockAdapters.TIKTOK.capabilities.canDraftOnly).toBe(true);
      expect(allMockAdapters.TIKTOK.capabilities.canDirectPublish).toBe(false);
    });

    it("Twitch adapter is draft-only", () => {
      expect(allMockAdapters.TWITCH.capabilities.canDraftOnly).toBe(true);
      expect(allMockAdapters.TWITCH.capabilities.canDirectPublish).toBe(false);
    });

    it("Bluesky adapter does not support native scheduling", () => {
      expect(allMockAdapters.BLUESKY.capabilities.canSchedule).toBe(false);
    });

    it("all adapters have max caption length defined", () => {
      for (const [platform, adapter] of Object.entries(allMockAdapters)) {
        expect(adapter.capabilities.maxCaptionLength).toBeGreaterThan(0);
      }
    });
  });

  describe("graceful degradation", () => {
    it("TikTok warns when trying to direct publish", () => {
      const warning = allMockAdapters.TIKTOK.getDegradationWarning("publish");
      expect(warning).not.toBeNull();
      expect(warning).toContain("draft");
    });

    it("Facebook returns null warning for publish (supported)", () => {
      const warning = allMockAdapters.FACEBOOK.getDegradationWarning("publish");
      expect(warning).toBeNull();
    });

    it("Bluesky warns about native scheduling", () => {
      const warning = allMockAdapters.BLUESKY.getDegradationWarning("schedule");
      expect(warning).not.toBeNull();
    });

    it("Facebook returns null warning for schedule (supported)", () => {
      const warning = allMockAdapters.FACEBOOK.getDegradationWarning("schedule");
      expect(warning).toBeNull();
    });
  });

  describe("mock publish", () => {
    it("Facebook adapter publishes successfully", async () => {
      const result = await allMockAdapters.FACEBOOK.publish({
        caption: "Playing Burlington Bar on Saturday.",
        hashtags: ["#chicago"],
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toBeTruthy();
      expect(result.externalPostUrl).toBeTruthy();
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("TikTok adapter publishes as draft", async () => {
      const result = await allMockAdapters.TIKTOK.publish({
        caption: "POV: You came to a Rad Dad show.",
        hashtags: ["#raddad", "#coverband"],
      });

      expect(result.success).toBe(true);
      expect(result.externalPostUrl).toContain("draft");
    });

    it("each adapter generates unique post IDs", async () => {
      const result1 = await allMockAdapters.INSTAGRAM.publish({
        caption: "Test post 1",
        hashtags: [],
      });
      const result2 = await allMockAdapters.INSTAGRAM.publish({
        caption: "Test post 2",
        hashtags: [],
      });

      expect(result1.externalPostId).not.toEqual(result2.externalPostId);
    });

    it("all adapters return valid results", async () => {
      const platforms = ["FACEBOOK", "INSTAGRAM", "BLUESKY", "TIKTOK", "YOUTUBE", "TWITCH"] as const;
      for (const platform of platforms) {
        const result = await allMockAdapters[platform].publish({
          caption: "Test caption for all platforms",
          hashtags: [],
        });
        expect(result.success).toBe(true);
        expect(result.durationMs).toBeGreaterThan(0);
      }
    });
  });

  describe("credential validation", () => {
    it("all mock adapters validate credentials successfully", async () => {
      const platforms = ["FACEBOOK", "INSTAGRAM", "BLUESKY"] as const;
      for (const platform of platforms) {
        const valid = await allMockAdapters[platform].validateCredentials();
        expect(valid).toBe(true);
      }
    });
  });
});
