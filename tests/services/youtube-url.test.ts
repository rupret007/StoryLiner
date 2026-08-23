import { extractYouTubeVideoId } from "@/lib/services/publish/youtube-url";

describe("extractYouTubeVideoId", () => {
  it("reads watch, short, embed, and live https URLs", () => {
    expect(extractYouTubeVideoId(["https://www.youtube.com/watch?v=abcdefghijk"])).toBe(
      "abcdefghijk"
    );
    expect(extractYouTubeVideoId(["https://youtu.be/abcdefghijk"])).toBe("abcdefghijk");
    expect(extractYouTubeVideoId(["https://www.youtube.com/shorts/abcdefghijk"])).toBe(
      "abcdefghijk"
    );
    expect(extractYouTubeVideoId(["https://www.youtube.com/embed/abcdefghijk"])).toBe(
      "abcdefghijk"
    );
    expect(extractYouTubeVideoId(["https://www.youtube.com/live/abcdefghijk"])).toBe(
      "abcdefghijk"
    );
    expect(extractYouTubeVideoId(["https://m.youtube.com/watch?v=abcdefghijk"])).toBe(
      "abcdefghijk"
    );
  });

  it("refuses bare ids, http, and non-YouTube https URLs", () => {
    expect(extractYouTubeVideoId(["abcdefghijk"])).toBeNull();
    expect(extractYouTubeVideoId(["http://youtu.be/abcdefghijk"])).toBeNull();
    expect(extractYouTubeVideoId(["https://example.com/abcdefghijk"])).toBeNull();
    expect(extractYouTubeVideoId(["https://www.youtube.com/watch"])).toBeNull();
  });
});
