const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/**
 * Pull an 11-character video id from public https YouTube URLs only.
 * Bare ids, credentialed URLs, and http are refused so the schedule gate
 * and the YouTube adapter agree.
 */
export function extractYouTubeVideoId(urls: unknown): string | null {
  if (!Array.isArray(urls)) return null;

  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }

    if (parsed.protocol !== "https:") continue;
    if (parsed.username || parsed.password) continue;

    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) continue;

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      if (YOUTUBE_VIDEO_ID.test(id)) return id;
      continue;
    }

    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery && YOUTUBE_VIDEO_ID.test(fromQuery)) return fromQuery;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") &&
      YOUTUBE_VIDEO_ID.test(parts[1])
    ) {
      return parts[1];
    }
  }

  return null;
}
