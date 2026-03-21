import { YouTubeRealAdapter } from "./youtube-adapter";
import { PublishPayload } from "../base";

describe("YouTubeRealAdapter", () => {
  let adapter: YouTubeRealAdapter;

  // These mocks should be here, applicable to the whole YouTubeRealAdapter suite
  const mockFetch = jest.fn();
  // @ts-ignore
  global.fetch = mockFetch;

  beforeEach(() => {
    adapter = new YouTubeRealAdapter();
    // Mock getAccessToken and extractYouTubeVideoId for isolated testing
    // @ts-ignore
    adapter.getAccessToken = jest.fn(() => Promise.resolve("mock-access-token"));
    // @ts-ignore
    adapter.extractYouTubeVideoId = jest.fn((_urls: string[]) => "mockVideoId");
    // Clear mockFetch for each test case
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateVideoDescription", () => {
    it("should update description with caption only", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ snippet: { title: "Test Title", description: "Old Description" } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const payload: PublishPayload = {
        caption: "New caption for the video.",
        mediaUrls: [],
        hashtags: [],
        platformAccount: {} as any,
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
          id: "mockVideoId",
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
          json: () => Promise.resolve({}),
        });

      const payload: PublishPayload = {
        caption: "Caption with some content.",
        mediaUrls: [],
        hashtags: ["#hashtag1", "#hashtag2"],
        platformAccount: {} as any,
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
          id: "mockVideoId",
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
          json: () => Promise.resolve({}),
        });

      const longCaption = "a".repeat(4990);
      const hashtagBlock = "\n\n#short #tags"; // Length is 14
      const expectedDescription = `${longCaption.substring(0, 5000 - hashtagBlock.length)}\n\n#short #tags`;

      const payload: PublishPayload = {
        caption: longCaption,
        mediaUrls: [],
        hashtags: ["#short", "#tags"],
        platformAccount: {} as any,
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
          json: () => Promise.resolve({}),
        });

      const payload: PublishPayload = {
        caption: "",
        mediaUrls: [],
        hashtags: ["#onlyhashtags"],
        platformAccount: {} as any,
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
          id: "mockVideoId",
          snippet: {
            title: "Test Title",
            description: "\n\n#onlyhashtags",
          },
        }),
      });
    });
  });
});
