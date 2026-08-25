import type { Platform } from "@prisma/client";
import { extractYouTubeVideoId } from "@/lib/services/publish/youtube-url";

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
  return extractYouTubeVideoId(urls) != null;
}

export { extractYouTubeVideoId };

export const POSSIBLE_LIVE_WRITE_MARKER = "POSSIBLE_LIVE_WRITE:";

export const POSSIBLE_LIVE_WRITE_NOTE =
  "POSSIBLE_LIVE_WRITE: A Facebook / Instagram / YouTube write may already be live. " +
  "Check the platform before scheduling again. This does not publish.";

export function draftHasPossibleLiveWrite(
  reviewNotes: string | null | undefined
): boolean {
  return typeof reviewNotes === "string" && reviewNotes.includes(POSSIBLE_LIVE_WRITE_MARKER);
}

export function withPossibleLiveWriteNote(
  reviewNotes: string | null | undefined
): string {
  if (draftHasPossibleLiveWrite(reviewNotes)) {
    return reviewNotes as string;
  }
  if (!reviewNotes?.trim()) return POSSIBLE_LIVE_WRITE_NOTE;
  return `${POSSIBLE_LIVE_WRITE_NOTE}\n${reviewNotes.trim()}`;
}

export function stripPossibleLiveWriteNote(
  reviewNotes: string | null | undefined
): string | null {
  if (!reviewNotes) return null;
  const stripped = reviewNotes
    .split("\n")
    .filter((line) => !line.includes(POSSIBLE_LIVE_WRITE_MARKER))
    .join("\n")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Hold / Approve must not erase POSSIBLE_LIVE_WRITE. That sentinel is
 * the schedule gate after a write may already be live.
 *
 * `undefined` next means "leave the existing notes" (Prisma skip).
 * The marker is still returned when it was already present so a later
 * explicit write cannot drop it by accident.
 */
export function mergeReviewNotesPreservingPossibleLiveWrite(
  existing: string | null | undefined,
  next: string | null | undefined
): string | null | undefined {
  if (next === undefined) {
    return draftHasPossibleLiveWrite(existing) ? (existing as string) : undefined;
  }

  if (draftHasPossibleLiveWrite(existing)) {
    return withPossibleLiveWriteNote(next);
  }

  const trimmed = next?.trim();
  return trimmed ? trimmed : null;
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

export function canRescheduleJob(
  jobStatus: string | null | undefined,
  adapterWriteStarted = false
): boolean {
  if (adapterWriteStarted) return false;
  return jobStatus == null || jobStatus === "PENDING";
}

/**
 * Unschedule is only honest while the worker has not reached Facebook /
 * Instagram / YouTube. A write-started job is a failed write, even if
 * the worker briefly left it PENDING for retry.
 */
export function isCleanPendingScheduleJob(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): boolean {
  return options.jobStatus === "PENDING" && !options.adapterWriteStarted;
}

/**
 * Calendar / Dashboard / the Scheduled Posts count must not treat a
 * FAILED + adapterWriteStarted row as still queued. The worker will not
 * pick it up, and Facebook / Instagram / YouTube may already have a post.
 */
export function isQueuedUpcomingSchedule(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): boolean {
  return isCleanPendingScheduleJob(options);
}

/**
 * A RUNNING job may already have set adapterWriteStarted while its adapter
 * request is still in flight. Keep that row out of the queue without calling
 * an active publish a failed write.
 */
export function isFailedWriteStartedSchedule(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): boolean {
  return options.adapterWriteStarted && options.jobStatus !== "RUNNING";
}

export function scheduleQueueHeadline(counts: {
  queued: number;
  failedWriteStarted: number;
}): string {
  const queued = `${counts.queued} post${counts.queued !== 1 ? "s" : ""} queued`;
  if (counts.failedWriteStarted <= 0) return queued;
  const failed =
    `${counts.failedWriteStarted} failed write` +
    `${counts.failedWriteStarted !== 1 ? "s" : ""} — check Facebook / Instagram / YouTube`;
  return `${queued} · ${failed}`;
}

export function upcomingScheduleBadge(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): { label: string; variant: "info" | "warning" | "destructive" } {
  if (options.jobStatus === "RUNNING") {
    return { label: "Publishing", variant: "warning" };
  }
  if (options.adapterWriteStarted || options.jobStatus === "FAILED") {
    return { label: "Publish failed", variant: "destructive" };
  }
  return { label: "Post", variant: "info" };
}

export function dashboardFailedWriteStartedNote(failedWriteStarted: number): string | null {
  if (failedWriteStarted <= 0) return null;
  return (
    `${failedWriteStarted} failed write${failedWriteStarted !== 1 ? "s" : ""} ` +
    `may already be live. Open Scheduled Posts. This is not a queued publish.`
  );
}

export function returnScheduleButtonLabel(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): "Unschedule" | "Return to Approved" {
  return isCleanPendingScheduleJob(options) ? "Unschedule" : "Return to Approved";
}

export function returnScheduleSuccessToast(options: {
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
}): string {
  if (options.adapterWriteStarted) {
    return (
      "Returned to Approved. A Facebook / Instagram / YouTube write may already be live. " +
      "This did not publish."
    );
  }
  if (options.jobStatus === "PENDING") {
    return "Unscheduled. Nothing was published.";
  }
  return "Returned to Approved. Nothing was published. Schedule again after the fix.";
}

/**
 * Persist an honest job error when pulling a schedule back.
 * A write-started PENDING job is Return to Approved, not "nothing was published."
 */
export function unscheduleJobErrorMessage(adapterWriteStarted: boolean): string {
  if (adapterWriteStarted) {
    return (
      "Returned to Approved after a Facebook / Instagram / YouTube write may already be live. " +
      "StoryLiner did not mark this published."
    );
  }
  return "Unscheduled by operator. Nothing was published.";
}

export function claimsNothingWasPublished(message: string): boolean {
  return /nothing was published/i.test(message);
}

/**
 * Adapter / worker errors often say "Nothing was published" after the write
 * already started (Graph 200 without id, Instagram container created).
 * The queue must not repeat that claim.
 */
export function honestJobFailureMessage(options: {
  errorMessage: string | null | undefined;
  adapterWriteStarted: boolean;
}): string | null {
  const raw = options.errorMessage?.trim();
  if (!raw) return null;
  if (options.adapterWriteStarted && claimsNothingWasPublished(raw)) {
    return raw.replace(/nothing was published/gi, "StoryLiner did not mark this published");
  }
  return raw;
}

export function writeStartedQueueWarning(options: { jobFailed: boolean }): string {
  if (options.jobFailed) {
    return (
      "A Facebook / Instagram / YouTube write may already be live. " +
      "StoryLiner did not mark this published. Check the platform before scheduling again."
    );
  }
  return (
    "A Facebook / Instagram / YouTube write may already be live. " +
    "Cannot Unschedule or Reschedule as if this is still pending."
  );
}

/**
 * A draft marked possible-live-write cannot be scheduled again until Jeff
 * confirms he checked Facebook / Instagram / YouTube.
 */
export function assertCanScheduleAfterPossibleLiveWrite(options: {
  possibleLiveWrite: boolean;
  confirmCheckedNoLivePost?: boolean;
}): LivePublishSafety {
  if (options.possibleLiveWrite && !options.confirmCheckedNoLivePost) {
    return {
      ok: false,
      reason:
        "A previous Facebook / Instagram / YouTube write may already be live. " +
        "Check the platform, then confirm. Scheduling still does not publish.",
    };
  }
  return { ok: true };
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
const DUPLICABLE_STATUSES = new Set([
  "DRAFT",
  "IN_REVIEW",
  "HELD",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

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
 * Copy is not Unschedule and is not a second live yes.
 * A scheduled or published draft already has a Facebook / Instagram /
 * YouTube path. Duplicating it would create a clean IN_REVIEW row that
 * can be approved and scheduled without the platform check.
 */
export function assertCanDuplicateDraft(options: {
  status: string;
}): LivePublishSafety {
  if (options.status === "SCHEDULED" || options.status === "PUBLISHED") {
    return {
      ok: false,
      reason:
        "Cannot copy a scheduled or published draft. Copy is not Unschedule " +
        "and is not a second live yes. Return to Approved first if the job " +
        "failed. This does not publish.",
    };
  }

  if (!DUPLICABLE_STATUSES.has(options.status)) {
    return {
      ok: false,
      reason: `Draft cannot be copied from status ${options.status}.`,
    };
  }

  return { ok: true };
}

/**
 * Copy must not drop POSSIBLE_LIVE_WRITE. Hold / Approve already keep
 * the sentinel; a new draft without it can be scheduled as if nothing
 * reached Facebook / Instagram / YouTube.
 */
export function reviewNotesForDuplicateDraft(
  existing: string | null | undefined
): string | undefined {
  if (!draftHasPossibleLiveWrite(existing)) {
    return undefined;
  }

  return withPossibleLiveWriteNote(
    "Duplicated from a draft that may already have a live Facebook / Instagram / YouTube write. " +
      "Copy is not publish. Check the platform before scheduling."
  );
}

export function duplicateDraftSuccessToast(options: {
  possibleLiveWrite: boolean;
}): string {
  if (options.possibleLiveWrite) {
    return (
      "Copied to review. A Facebook / Instagram / YouTube write may already be live. " +
      "Copy is not publish."
    );
  }
  return "Duplicated. Find the copy in the In Review tab.";
}

export function holdSuccessToast(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Held. This did not publish. A Facebook / Instagram / YouTube write may already be live."
    );
  }
  return "Held. Nothing was scheduled or published.";
}

export function denySuccessToast(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Denied. This did not publish. A Facebook / Instagram / YouTube write may already be live."
    );
  }
  return "Denied. Nothing was scheduled or published.";
}

export function resumeHeldSuccessToast(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Returned to Needs Review. This did not publish. " +
      "A Facebook / Instagram / YouTube write may already be live."
    );
  }
  return "Returned to Needs Review. Still not published.";
}

export function holdConfirmDescription(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Parks the draft for later. This does not publish. " +
      "A Facebook / Instagram / YouTube write may already be live. " +
      "Hold does not clear the schedule gate."
    );
  }
  return "Parks the draft for later. Nothing is scheduled or published. You can approve or deny it from the On Hold tab.";
}

export function denyConfirmDescription(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Denies the caption. This does not publish. " +
      "A Facebook / Instagram / YouTube write may already be live. " +
      "Copy keeps that warning if you want another pass."
    );
  }
  return "Denies the caption. It will not be scheduled or published. Duplicate it first if you want a copy.";
}

/**
 * Pull a scheduled draft back to Approved. Does not publish.
 *
 * PENDING (no write yet) can unschedule.
 * FAILED can return.
 * If the adapter write already started, Jeff must confirm he checked
 * Facebook / Instagram / YouTube so a new schedule cannot silently double-post.
 */
export function assertCanReturnScheduleToApproved(options: {
  scheduledStatus: string;
  draftStatus: string;
  jobStatus: string | null | undefined;
  adapterWriteStarted: boolean;
  confirmCheckedPlatform?: boolean;
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

  if (options.scheduledStatus !== "SCHEDULED") {
    return {
      ok: false,
      reason: `Cannot return a ${options.scheduledStatus} scheduled post.`,
    };
  }

  if (options.jobStatus !== "PENDING" && options.jobStatus !== "FAILED") {
    return {
      ok: false,
      reason: "Only a pending or failed job can return to Approved. This does not publish.",
    };
  }

  if (options.adapterWriteStarted && !options.confirmCheckedPlatform) {
    return {
      ok: false,
      reason:
        "A live write may have already reached Facebook / Instagram / YouTube. " +
        "Check the platform, then confirm. This does not publish.",
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
  adapterWriteStarted?: boolean;
  confirmCheckedPlatform?: boolean;
}): LivePublishSafety {
  if (options.jobStatus !== "FAILED") {
    return {
      ok: false,
      reason: "Only a failed publish job can return to Approved. This does not publish.",
    };
  }

  return assertCanReturnScheduleToApproved({
    scheduledStatus: options.scheduledStatus,
    draftStatus: options.draftStatus,
    jobStatus: options.jobStatus,
    adapterWriteStarted: options.adapterWriteStarted === true,
    confirmCheckedPlatform: options.confirmCheckedPlatform,
  });
}
