import { YouTubeRealAdapter } from "./youtube-adapter";
import { PublishPayload } from "../base";

const VIDEO_URL = "https://www.youtube.com/watch?v=abcdefghijk";

describe("YouTubeRealAdapter", () => {
  let adapter: YouTubeRealAdapter;

  const mockFetch = jest.fn();
  global.fetch = mockFetch as typeof fetch;

  beforeEach(() => {
    adapter = new YouTubeRealAdapter();
    // @ts-expect-error mocking private method
    adapter.getAccessToken = jest.fn(() => Promise.resolve("mock-access-token"));
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateVideoDescription", () => {
    it("fails closed when a video id is present without explicit allow flag", async () => {
      const result = await adapter.publish({
        caption: "New caption for the video.",
        mediaUrls: [VIDEO_URL],
        hashtags: [],
        accountMetadata: {},
        scheduledFor: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.isDraftOnly).toBe(true);
      expect(result.errorMessage).toMatch(/allowVideoDescriptionUpdate/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("treats shorts URLs as a video id so the schedule gate and adapter agree", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "abcdefghijk" }),
        });

      const result = await adapter.publish({
        caption: "Shorts description.",
        mediaUrls: ["https://www.youtube.com/shorts/abcdefghijk"],
        hashtags: [],
        accountMetadata: { allowVideoDescriptionUpdate: true },
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toBe("abcdefghijk");
    });

    it("should update description with caption only", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "abcdefghijk" }),
        });

      const payload: PublishPayload = {
        caption: "New caption for the video.",
        mediaUrls: [VIDEO_URL],
        hashtags: [],
        accountMetadata: { allowVideoDescriptionUpdate: true },
        scheduledFor: new Date(),
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock-access-token",
        },
        body: JSON.stringify({
          id: "abcdefghijk",
          snippet: {
            title: "Test Title",
            description: "New caption for the video.",
          },
        }),
      });
    });

    it("should update description with caption and hashtags", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "abcdefghijk" }),
        });

      const payload: PublishPayload = {
        caption: "Caption with some content.",
        mediaUrls: [VIDEO_URL],
        hashtags: ["#hashtag1", "#hashtag2"],
        accountMetadata: { allowVideoDescriptionUpdate: true },
        scheduledFor: new Date(),
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock-access-token",
        },
        body: JSON.stringify({
          id: "abcdefghijk",
          snippet: {
            title: "Test Title",
            description: "Caption with some content.\n\n#hashtag1 #hashtag2",
          },
        }),
      });
    });

    it("should truncate caption if too long with hashtags", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "abcdefghijk" }),
        });

      const longCaption = "a".repeat(4990);
      const hashtagBlock = "\n\n#short #tags"; // Length is 14
      const expectedDescription = `${longCaption.substring(0, 5000 - hashtagBlock.length)}\n\n#short #tags`;

      const payload: PublishPayload = {
        caption: longCaption,
        mediaUrls: [VIDEO_URL],
        hashtags: ["#short", "#tags"],
        accountMetadata: { allowVideoDescriptionUpdate: true },
        scheduledFor: new Date(),
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(true);
      const fetchCallArgs = mockFetch.mock.calls[1]; // Second call is the PUT request
      const requestBody = JSON.parse(fetchCallArgs[1].body);
      expect(requestBody.snippet.description).toBe(expectedDescription);
    });

    it("should handle empty caption with hashtags", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "abcdefghijk" }),
        });

      const payload: PublishPayload = {
        caption: "",
        mediaUrls: [VIDEO_URL],
        hashtags: ["#onlyhashtags"],
        accountMetadata: { allowVideoDescriptionUpdate: true },
        scheduledFor: new Date(),
      };

      const result = await adapter.publish(payload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock-access-token",
        },
        body: JSON.stringify({
          id: "abcdefghijk",
          snippet: {
            title: "Test Title",
            description: "\n\n#onlyhashtags",
          },
        }),
      });
    });

    it("fails closed when the update response omits the video id", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await adapter.publish({
        caption: "New caption for the video.",
        mediaUrls: [VIDEO_URL],
        hashtags: [],
        accountMetadata: { allowVideoDescriptionUpdate: true },
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/matching video id/i);
    });
  });
});
