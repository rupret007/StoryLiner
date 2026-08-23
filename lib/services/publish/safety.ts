import type { Platform } from "@prisma/client";

/** Platforms that have a real write adapter. All others must stay mock/draft-only. */
export const REAL_LIVE_PLATFORMS: ReadonlySet<Platform> = new Set([
  "FACEBOOK",
  "INSTAGRAM",
  "YOUTUBE",
]);

export type LivePublishSafety =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Extra yes-gate before a real adapter can write.
 *
 * Mock mode may publish simulated posts for demo accounts (isConnected=false).
 * Real mode must not live-post to Facebook/Instagram/YouTube unless the
 * operator has explicitly connected that platform account.
 *
 * This does not add auto-publish. Approve → schedule → worker still required.
 */
export function assertSafeToLivePublish(options: {
  socialAdapterMode: string;
  platform: Platform;
  accountIsConnected: boolean;
  accountIsActive: boolean;
}): LivePublishSafety {
  const mode = options.socialAdapterMode || "mock";

  if (mode !== "real") {
    return { ok: true };
  }

  if (!REAL_LIVE_PLATFORMS.has(options.platform)) {
    return { ok: true };
  }

  if (!options.accountIsActive) {
    return {
      ok: false,
      reason: `Refusing live ${options.platform} publish: platform account is inactive.`,
    };
  }

  if (!options.accountIsConnected) {
    return {
      ok: false,
      reason:
        `Refusing live ${options.platform} publish: platform account is not connected. ` +
        "Connect the account in Integrations after Jeff's separate yes. Seed/demo accounts stay disconnected.",
    };
  }

  return { ok: true };
}

/**
 * Keep only public https URLs. Rejects javascript:, data:, http:, and junk.
 */
export function sanitizeMediaUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }

    if (parsed.protocol !== "https:") continue;
    if (parsed.username || parsed.password) continue;

    seen.add(trimmed);
    cleaned.push(trimmed);
  }

  return cleaned;
}

export function hasYouTubeVideoUrl(urls: string[]): boolean {
  return urls.some((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (host === "youtu.be") return parsed.pathname.length > 1;
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        return (
          parsed.searchParams.has("v") ||
          parsed.pathname.startsWith("/watch") ||
          parsed.pathname.startsWith("/shorts/") ||
          parsed.pathname.startsWith("/embed/") ||
          parsed.pathname.startsWith("/live/")
        );
      }
      return false;
    } catch {
      return false;
    }
  });
}

function metadataFlag(metadata: unknown, key: string): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>)[key] === true;
}

/**
 * Full live-publish readiness gate used by schedule + worker.
 *
 * Real mode:
 *   - Facebook / Instagram / YouTube only
 *   - Instagram requires at least one public https media URL
 *   - YouTube live write requires a YouTube URL and an explicit
 *     allowVideoDescriptionUpdate flag on the platform account
 *
 * Mock mode still allows caption-only Instagram so the demo queue works.
 * This does not add auto-publish.
 */
export function assertReadyForLivePublish(options: {
  socialAdapterMode: string;
  platform: Platform;
  accountIsConnected: boolean;
  accountIsActive: boolean;
  mediaUrls?: unknown;
  accountMetadata?: unknown;
}): LivePublishSafety {
  const connected = assertSafeToLivePublish(options);
  if (!connected.ok) return connected;

  const mode = options.socialAdapterMode || "mock";
  const mediaUrls = sanitizeMediaUrls(options.mediaUrls);

  if (mode === "real" && !REAL_LIVE_PLATFORMS.has(options.platform)) {
    return {
      ok: false,
      reason:
        `Refusing live ${options.platform} publish: StoryLiner live destinations are ` +
        "Facebook, Instagram, and YouTube only.",
    };
  }

  if (mode === "real" && options.platform === "INSTAGRAM" && mediaUrls.length === 0) {
    return {
      ok: false,
      reason:
        "Refusing live Instagram publish: a public https image or video URL is required. " +
        "Attach media on the draft, then schedule again.",
    };
  }

  if (mode === "real" && options.platform === "YOUTUBE") {
    const allowUpdate = metadataFlag(options.accountMetadata, "allowVideoDescriptionUpdate");
    if (!allowUpdate || !hasYouTubeVideoUrl(mediaUrls)) {
      return {
        ok: false,
        reason:
          "Refusing live YouTube write: needs a YouTube video URL and " +
          "allowVideoDescriptionUpdate=true on the connected account. " +
          "Text posts have no API — copy them in YouTube Studio. Nothing was marked published.",
      };
    }
  }

  return { ok: true };
}

/**
 * Adapter results that did not go live must never flip a draft or scheduled
 * post to PUBLISHED. Draft-only / unsuccessful writes fail closed.
 */
export function assertLivePublishResult(options: {
  success: boolean;
  isDraftOnly?: boolean;
  errorMessage?: string | null;
}): LivePublishSafety {
  if (!options.success) {
    return {
      ok: false,
      reason: options.errorMessage?.trim() || "Publish failed with unknown error",
    };
  }

  if (options.isDraftOnly) {
    return {
      ok: false,
      reason:
        "Adapter returned draft-only. Refusing to mark the post as published. " +
        "Attach required media or publish manually in the platform.",
    };
  }

  return { ok: true };
}

export function assertCanApproveDraft(options: {
  status: string;
  riskLevel: string;
  confirmHighRisk?: boolean;
}): LivePublishSafety {
  if (options.status !== "IN_REVIEW") {
    return {
      ok: false,
      reason: `Draft cannot be approved from status ${options.status}.`,
    };
  }

  if (options.riskLevel === "HIGH" && !options.confirmHighRisk) {
    return {
      ok: false,
      reason: "High-risk drafts need an extra confirm before approve.",
    };
  }

  return { ok: true };
}

export function canRescheduleJob(jobStatus: string | null | undefined): boolean {
  return jobStatus == null || jobStatus === "PENDING";
}
