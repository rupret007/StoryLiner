import { FacebookRealAdapter } from "./facebook-adapter";
import { PublishPayload } from "../base";

describe("FacebookRealAdapter", () => {
  let adapter: FacebookRealAdapter;
  const mockFetch = jest.fn();

  beforeEach(() => {
    adapter = new FacebookRealAdapter();
    global.fetch = mockFetch as typeof fetch;
    mockFetch.mockClear();
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "mock-token";
    process.env.FACEBOOK_PAGE_ID = "mock-id";
  });

  describe("publish", () => {
    it("should publish a simple post immediately", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "pageid_postid" }),
      });

      const payload: PublishPayload = {
        caption: "Hello Facebook!",
        mediaUrls: [],
        hashtags: ["#band", "#music"],
        accountMetadata: { pageId: "123" },
        scheduledFor: undefined,
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(true);
      expect(result.externalPostId).toBe("pageid_postid");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("123/feed"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Hello Facebook!\\n\\n#band #music"),
        })
      );
    });

    it("refuses Facebook native scheduled publish when scheduledFor is in the future", async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      const payload: PublishPayload = {
        caption: "Scheduled post",
        mediaUrls: [],
        hashtags: [],
        accountMetadata: { pageId: "123" },
        scheduledFor: futureDate,
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/StoryLiner owns scheduling/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed when Graph API omits a post id", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.publish({
        caption: "No id",
        mediaUrls: [],
        hashtags: [],
        accountMetadata: { pageId: "123" },
        scheduledFor: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.externalPostId).toBeUndefined();
      expect(result.errorMessage).toMatch(/without a post id/i);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "Invalid OAuth access token" } }),
      });

      const payload: PublishPayload = {
        caption: "Fail",
        mediaUrls: [],
        hashtags: [],
        accountMetadata: { pageId: "123" },
        scheduledFor: undefined,
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Invalid OAuth access token");
    });
  });

  describe("deletePost", () => {
    it("should delete a post successfully", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await adapter.deletePost("123_456");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("123_456"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
