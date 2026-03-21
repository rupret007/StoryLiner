import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { InstagramRealAdapter } from "./instagram-adapter";
import type { PublishPayload } from "../base";

describe("InstagramRealAdapter", () => {
  let adapter: InstagramRealAdapter;
  const mockPayload: PublishPayload = {
    caption: "Test Instagram Post",
    hashtags: ["#test", "#rad"],
    mediaUrls: ["https://example.com/image.jpg"],
    platform: "INSTAGRAM",
    accountMetadata: {
      instagramUserId: "123456789",
    },
  };

  beforeEach(() => {
    adapter = new InstagramRealAdapter();
    // Reset fetch mocks
    global.fetch = jest.fn() as any;
    
    // Mock credentials
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fake_token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "123456789";
  });

  describe("publish", () => {
    it("should return isDraftOnly: true if no mediaUrls are provided", async () => {
      const payloadWithoutMedia = { ...mockPayload, mediaUrls: [] };
      const result = await adapter.publish(payloadWithoutMedia);

      expect(result.success).toBe(true);
      expect(result.isDraftOnly).toBe(true);
      expect(result.externalPostId).toBeUndefined();
    });

    it("should handle the two-step publishing process (container + publish)", async () => {
      // 1. Mock container creation response
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: "container_123" }),
        })
        // 2. Mock publish response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: "post_123" }),
        });

      const result = await adapter.publish(mockPayload);

      expect(result.success).toBe(true);
      expect(result.externalPostId).toBe("post_123");
      expect(result.externalPostUrl).toContain("instagram.com/p/post_123/");
      
      // Verify both steps were called
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should handle container creation errors gracefully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "Invalid media URL" },
        }),
      });

      const result = await adapter.publish(mockPayload);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Invalid media URL");
      expect(result.responseCode).toBe(400);
    });
  });

  describe("deletePost", () => {
    it("should delete a post successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const result = await adapter.deletePost("post_123");
      expect(result).toBe(true);
    });
  });
});
