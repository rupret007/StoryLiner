import type { Platform } from "@prisma/client";

/** Platforms that have a real write adapter. All others must stay mock/draft-only. */
export const REAL_LIVE_PLATFORMS: ReadonlySet<Platform> = new Set([
  "FACEBOOK",
  "INSTAGRAM",
  "YOUTUBE",
]);

export const REFUSED_LIVE_PLATFORMS: ReadonlySet<Platform> = new Set([
  "TWITTER",
  "TIKTOK",
  "BLUESKY",
  "TWITCH",
]);

export const LIVE_DESTINATION_REFUSAL =
  "Refusing live publish: StoryLiner live destinations are Facebook, Instagram, and YouTube only.";

export function isLiveDestinationPlatform(platform: Platform): boolean {
  return REAL_LIVE_PLATFORMS.has(platform);
}

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
    return {
      ok: false,
      reason: `${LIVE_DESTINATION_REFUSAL} ${options.platform} is refused in the live path.`,
    };
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
      reason: `${LIVE_DESTINATION_REFUSAL} ${options.platform} is refused in the live path.`,
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
 * A live success also requires a non-empty external post id — empty ids
 * are treated as a failed write, not a silent publish.
 */
export function assertLivePublishResult(options: {
  success: boolean;
  isDraftOnly?: boolean;
  errorMessage?: string | null;
  externalPostId?: string | null;
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

  const externalPostId = options.externalPostId?.trim();
  if (!externalPostId) {
    return {
      ok: false,
      reason:
        "Adapter reported success without an external post id. " +
        "Refusing to mark the post as published.",
    };
  }

  return { ok: true };
}

const APPROVABLE_STATUSES = new Set(["IN_REVIEW", "HELD"]);
const HOLDABLE_STATUSES = new Set(["IN_REVIEW", "APPROVED"]);
const DENIABLE_STATUSES = new Set(["IN_REVIEW", "HELD"]);

export function assertCanApproveDraft(options: {
  status: string;
  riskLevel: string;
  confirmHighRisk?: boolean;
}): LivePublishSafety {
  if (!APPROVABLE_STATUSES.has(options.status)) {
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

/**
 * Hold parks a draft. It does not schedule or publish.
 * Allowed from IN_REVIEW (not ready yet) or APPROVED (not ready to schedule).
 */
export function assertCanHoldDraft(options: { status: string }): LivePublishSafety {
  if (!HOLDABLE_STATUSES.has(options.status)) {
    return {
      ok: false,
      reason: `Draft cannot be held from status ${options.status}.`,
    };
  }
  return { ok: true };
}

/**
 * Deny rejects a draft. It does not publish. Allowed from IN_REVIEW or HELD.
 */
export function assertCanDenyDraft(options: { status: string }): LivePublishSafety {
  if (!DENIABLE_STATUSES.has(options.status)) {
    return {
      ok: false,
      reason: `Draft cannot be denied from status ${options.status}.`,
    };
  }
  return { ok: true };
}

export function assertCanResumeHeldDraft(options: { status: string }): LivePublishSafety {
  if (options.status !== "HELD") {
    return {
      ok: false,
      reason: "Only held drafts can be returned to review.",
    };
  }
  return { ok: true };
}

const MUTABLE_CAPTION_STATUSES = new Set(["IN_REVIEW", "HELD", "APPROVED"]);

/**
 * Caption edit / rewrite must not pull SCHEDULED or PUBLISHED drafts
 * back into review while a worker job still exists.
 */
export function assertCanMutateDraftCaption(options: {
  status: string;
}): LivePublishSafety {
  if (!MUTABLE_CAPTION_STATUSES.has(options.status)) {
    return {
      ok: false,
      reason: `Caption cannot be changed from status ${options.status}.`,
    };
  }
  return { ok: true };
}

/**
 * After a failed live write, Jeff can return the draft to Approved
 * and schedule again. Never allowed for published or in-flight jobs.
 */
export function assertCanReturnFailedSchedule(options: {
  scheduledStatus: string;
  draftStatus: string;
  jobStatus: string | null | undefined;
}): LivePublishSafety {
  if (options.scheduledStatus === "PUBLISHED" || options.draftStatus === "PUBLISHED") {
    return {
      ok: false,
      reason: "Cannot unschedule a published post.",
    };
  }

  if (options.jobStatus === "RUNNING" || options.jobStatus === "DONE") {
    return {
      ok: false,
      reason: "Cannot return a post that is publishing or already completed.",
    };
  }

  if (options.jobStatus !== "FAILED") {
    return {
      ok: false,
      reason: "Only a failed publish job can return to Approved. This does not publish.",
    };
  }

  if (options.scheduledStatus !== "SCHEDULED") {
    return {
      ok: false,
      reason: `Cannot return a ${options.scheduledStatus} scheduled post.`,
    };
  }

  return { ok: true };
}
