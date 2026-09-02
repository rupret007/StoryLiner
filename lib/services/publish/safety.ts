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

export const TWITTER_SCHEMA_LEFTOVER_REFUSAL =
  `${LIVE_DESTINATION_REFUSAL} TWITTER is schema leftover. No real X adapter.`;

export function isLiveDestinationPlatform(platform: Platform): boolean {
  return REAL_LIVE_PLATFORMS.has(platform);
}

/** Twitter/X is schema leftover only. Never a live or mock-publish destination. */
export function isTwitterSchemaLeftover(platform: Platform): boolean {
  return platform === "TWITTER";
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

  // Schema leftover: refuse Twitter/X in mock and real. No tweet can go out.
  if (isTwitterSchemaLeftover(options.platform)) {
    return {
      ok: false,
      reason: TWITTER_SCHEMA_LEFTOVER_REFUSAL,
    };
  }

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

/**
 * Empty Scheduled Posts copy must describe the queue Jeff is looking at.
 * A completed schedule below does not need another Approve or schedule yes
 * unless Approved still has a draft waiting — Unschedule / Return put work
 * back there, and other approved drafts still need a schedule yes.
 */
export function scheduledPostsEmptyState(options: {
  recentlyPublishedCount: number;
  approvedCount?: number;
  possibleLiveWriteCount?: number;
}): { title: string; description: string } {
  const approvedCount = options.approvedCount ?? 0;
  const possibleLiveWriteCount = options.possibleLiveWriteCount ?? 0;

  if (approvedCount > 0) {
    const drafts = approvedCount === 1 ? "draft" : "drafts";
    const live =
      possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "No worker jobs waiting",
      description:
        `${approvedCount} approved ${drafts} still waiting for a schedule yes.` +
        `${live} Open the Approved tab. This does not publish.`,
    };
  }

  if (options.recentlyPublishedCount > 0) {
    const posts = options.recentlyPublishedCount === 1 ? "post" : "posts";
    const verb = options.recentlyPublishedCount === 1 ? "is" : "are";
    return {
      title: "No worker jobs waiting",
      description:
        `${options.recentlyPublishedCount} scheduled ${posts} ${verb} in Recently published below. ` +
        "No second Approve or schedule yes is needed. Opening this page does not publish.",
    };
  }

  return {
    title: "No worker jobs waiting",
    description:
      "No scheduled worker jobs are waiting. New schedules start from the Approved tab. " +
      "Opening this page does not approve, schedule, or publish.",
  };
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
    return "Unscheduled. Open the Approved tab. Nothing was published.";
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
const MUTABLE_MEDIA_STATUSES = new Set(["IN_REVIEW", "HELD", "APPROVED"]);
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
 * Media is part of the reviewed creative, not attachment metadata. Never
 * let an attach / replace / clear pull a scheduled or published draft back
 * into review while its worker path still exists.
 */
export function assertCanMutateDraftMedia(options: {
  status: string;
}): LivePublishSafety {
  if (!MUTABLE_MEDIA_STATUSES.has(options.status)) {
    return {
      ok: false,
      reason: `Media cannot be changed from status ${options.status}.`,
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

/**
 * Copy lands in IN_REVIEW. The review-queue tab is Needs Review,
 * not In Review. Write-started copy keeps the platform check.
 */
export function duplicateDraftSuccessToast(options: {
  possibleLiveWrite: boolean;
}): string {
  if (options.possibleLiveWrite) {
    return (
      "Copied to review. A Facebook / Instagram / YouTube write may already be live. " +
      "Copy is not publish."
    );
  }
  return "Duplicated. Find the copy in the Needs Review tab.";
}

/**
 * Approve is Jeff's yes to schedule, not a live post.
 * After POSSIBLE_LIVE_WRITE the next step is a platform check, not a
 * clean "ready to schedule."
 */
export function approveSuccessToast(options: { possibleLiveWrite: boolean }): string {
  if (options.possibleLiveWrite) {
    return (
      "Approved. This does not publish. " +
      "A Facebook / Instagram / YouTube write may already be live. " +
      "Check the platform before scheduling."
    );
  }
  return "Approved. This does not publish — schedule it from the Approved tab.";
}

export function approveHighRiskConfirmDescription(options: {
  possibleLiveWrite: boolean;
}): string {
  if (options.possibleLiveWrite) {
    return (
      "Guardrails flagged this caption. Approving does not publish it. " +
      "A Facebook / Instagram / YouTube write may already be live. " +
      "You still have to check the platform, then schedule separately."
    );
  }
  return (
    "Guardrails flagged this caption. Approving does not publish it. " +
    "You still have to schedule it separately."
  );
}

/**
 * Write-started returns land in Approved with POSSIBLE_LIVE_WRITE.
 * Calling those "Ready to Schedule" skips the platform check.
 */
export function approvedQueueTabLabel(options: {
  count: number;
  possibleLiveWriteCount: number;
}): string {
  if (options.possibleLiveWriteCount > 0) {
    return `Approved — Check platform before schedule (${options.count})`;
  }
  return `Approved — Ready to Schedule (${options.count})`;
}

/**
 * Edit / Rewrite from Approved or On Hold sets status IN_REVIEW.
 * Copy must name that move so the caption does not appear to remain
 * approved or parked after it leaves the current tab.
 */
export function captionMutationSuccessToast(options: {
  kind: "edit" | "rewrite";
  fromStatus: "IN_REVIEW" | "HELD" | "APPROVED";
  possibleLiveWrite: boolean;
}): string {
  const head = options.kind === "edit" ? "Caption updated." : "Rewrite applied.";

  if (options.fromStatus === "APPROVED" || options.fromStatus === "HELD") {
    const nextStep =
      options.fromStatus === "APPROVED"
        ? "approve again before scheduling."
        : "review it there before approving.";
    const live = options.possibleLiveWrite
      ? " A Facebook / Instagram / YouTube write may already be live."
      : "";
    return (
      `${head} Back in Needs Review — ${nextStep}` +
      `${live} This does not publish.`
    );
  }

  return options.kind === "edit"
    ? "Caption updated."
    : "Rewrite applied. Review the updated caption.";
}

/**
 * Attaching, replacing, or clearing media changes the publish payload.
 * Approved / Held creative therefore returns to Needs Review, just like a
 * caption edit. POSSIBLE_LIVE_WRITE remains a separate platform-check gate.
 */
export function mediaMutationSuccessToast(options: {
  cleared: boolean;
  fromStatus: "IN_REVIEW" | "HELD" | "APPROVED";
  possibleLiveWrite: boolean;
}): string {
  const head = options.cleared ? "Media cleared." : "Media updated.";
  const live = options.possibleLiveWrite
    ? " A Facebook / Instagram / YouTube write may already be live."
    : "";

  if (options.fromStatus === "APPROVED" || options.fromStatus === "HELD") {
    const nextStep =
      options.fromStatus === "APPROVED"
        ? "approve again before scheduling."
        : "review it there before approving.";
    return (
      `${head} Back in Needs Review — ${nextStep}` +
      `${live} This does not publish.`
    );
  }

  return `${head} Review it with the caption before approving.${live} This does not publish.`;
}

/**
 * Needs Review empty copy. That tab must not say the promo queue is
 * done while Approved still needs a schedule yes — or as if a hold
 * is not waiting on the On Hold tab.
 */
export function needsReviewEmptyState(options: {
  approvedCount: number;
  heldCount: number;
  possibleLiveWriteCount: number;
}): { title: string; description: string } {
  if (options.approvedCount > 0) {
    const n = options.approvedCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "Needs Review is empty",
      description:
        `${n} approved ${drafts} still waiting for a schedule yes.` +
        `${live} Open the Approved tab. This does not publish.`,
    };
  }

  if (options.heldCount > 0) {
    const n = options.heldCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "Needs Review is empty",
      description:
        `${n} ${drafts} on hold. Hold is not schedule and is not publish.` +
        `${live} Open the On Hold tab.`,
    };
  }

  return {
    title: "Nothing needs review",
    description:
      "No Bob drafts waiting for a review yes. Generate in Content Studio, or talk to Bob at the front door.",
  };
}

/**
 * After the last Needs Review yes, or the last On Hold yes, open Approved
 * so Jeff is not left on an empty tab that still talks like Hold is only
 * parking. Stay put when more review or more holds remain.
 */
export function shouldOpenApprovedTabAfterApprove(options: {
  currentTab: string;
  remainingNeedsReviewCount: number;
  remainingHeldCount?: number;
}): boolean {
  if (options.currentTab === "review") {
    return options.remainingNeedsReviewCount === 0;
  }
  if (options.currentTab === "held") {
    return (options.remainingHeldCount ?? 0) === 0;
  }
  return false;
}

/**
 * After the last Approved hold, open On Hold so Jeff is not left on an
 * empty Approved tab that still talks like the next step is a schedule.
 * Stay put from Needs Review. Stay put when more approved drafts remain.
 */
export function shouldOpenHeldTabAfterHold(options: {
  currentTab: string;
  remainingApprovedCount: number;
}): boolean {
  return options.currentTab === "approved" && options.remainingApprovedCount === 0;
}

/**
 * Copy always creates an IN_REVIEW draft. Open Needs Review when the copy
 * came from another tab so the newly created draft is not hidden behind the
 * old queue. Copy is still only a review action; it never schedules or posts.
 */
export function shouldOpenNeedsReviewTabAfterCopy(options: {
  currentTab: string;
}): boolean {
  return options.currentTab !== "review";
}

/**
 * Resume / Edit / Rewrite from Approved or On Hold land in IN_REVIEW.
 * Open Needs Review when that return came from another tab so the
 * caption is not hidden behind the old queue. These are still only
 * review actions; they never schedule or post.
 */
export function shouldOpenNeedsReviewTabAfterReturn(options: {
  currentTab: string;
}): boolean {
  return options.currentTab === "held" || options.currentTab === "approved";
}

/**
 * Review Queue first paint. After Unschedule / Return, the draft is
 * APPROVED. Opening empty Needs Review hides the schedule yes that
 * #25 already named on Scheduled Posts. Denied is terminal and is
 * never the first screen. This does not publish.
 */
export function reviewQueueInitialTab(options: {
  needsReviewCount: number;
  approvedCount: number;
  heldCount: number;
}): "review" | "held" | "approved" {
  if (options.needsReviewCount > 0) return "review";
  if (options.approvedCount > 0) return "approved";
  if (options.heldCount > 0) return "held";
  return "review";
}

/**
 * Dashboard Needs Review empty. That card is the first-screen review
 * list. "Queue is clear" overclaims the promo queue after Unschedule
 * put work back on Approved — or while a hold is still waiting.
 */
export function dashboardNeedsReviewEmptyState(options: {
  approvedCount: number;
  heldCount: number;
  possibleLiveWriteCount?: number;
}): string {
  const possibleLiveWriteCount = options.possibleLiveWriteCount ?? 0;

  if (options.approvedCount > 0) {
    const n = options.approvedCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return (
      `${n} approved ${drafts} still waiting for a schedule yes.` +
      `${live} Open Review Queue. This does not publish.`
    );
  }

  if (options.heldCount > 0) {
    const n = options.heldCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return (
      `${n} ${drafts} on hold. Hold is not schedule and is not publish.` +
      `${live} Open Review Queue.`
    );
  }

  return "Nothing needs review. Opening this page does not publish.";
}

/**
 * Dashboard Scheduled empty. Worker jobs only — same as Scheduled Posts.
 * After Unschedule the draft is on Approved. "Nothing scheduled yet"
 * must not talk as if no schedule yes is waiting.
 */
export function dashboardScheduledEmptyState(options: {
  approvedCount: number;
  failedWriteStartedCount: number;
  possibleLiveWriteCount?: number;
}): string {
  const possibleLiveWriteCount = options.possibleLiveWriteCount ?? 0;

  if (options.approvedCount > 0) {
    const n = options.approvedCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return (
      `${n} approved ${drafts} still waiting for a schedule yes.` +
      `${live} Open Review Queue. This does not publish.`
    );
  }

  if (options.failedWriteStartedCount > 0) {
    return "No queued publishes. Failed writes are on Scheduled Posts.";
  }

  return (
    "No worker jobs waiting. New schedules start from Review Queue. " +
    "This does not publish."
  );
}

/**
 * Approved empty copy. That tab must not talk as if the next step is
 * another Approve — or as if nothing is waiting — after a schedule yes.
 */
export function approvedEmptyState(options: {
  inReviewCount: number;
  heldCount: number;
  possibleLiveWriteCount: number;
}): { title: string; description: string } {
  if (options.inReviewCount > 0) {
    const n = options.inReviewCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "Approved is empty",
      description:
        `${n} Bob ${drafts} still waiting for a review yes.` +
        `${live} Open Needs Review. Approve is not publish.`,
    };
  }

  if (options.heldCount > 0) {
    const n = options.heldCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "Approved is empty",
      description:
        `${n} ${drafts} on hold. Hold is not schedule and is not publish.` +
        `${live} Open the On Hold tab.`,
    };
  }

  return {
    title: "Nothing waiting to schedule",
    description:
      "No approved drafts waiting for a schedule yes. Worker jobs are on Scheduled Posts. This does not publish.",
  };
}

/**
 * On Hold empty copy. That tab must not talk as if nothing is waiting
 * after the last hold-approve — or after a resume / edit / rewrite
 * sent the caption back to Needs Review.
 */
export function heldEmptyState(options: {
  approvedCount: number;
  inReviewCount: number;
  possibleLiveWriteCount: number;
}): { title: string; description: string } {
  if (options.approvedCount > 0) {
    const n = options.approvedCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "On Hold is empty",
      description:
        `${n} approved ${drafts} still waiting for a schedule yes.` +
        `${live} Open the Approved tab. This does not publish.`,
    };
  }

  if (options.inReviewCount > 0) {
    const n = options.inReviewCount;
    const drafts = n === 1 ? "draft" : "drafts";
    const live =
      options.possibleLiveWriteCount > 0
        ? " Check Facebook / Instagram / YouTube before scheduling."
        : "";
    return {
      title: "On Hold is empty",
      description:
        `${n} Bob ${drafts} still waiting for a review yes.` +
        `${live} Open Needs Review. Hold is not publish.`,
    };
  }

  return {
    title: "Nothing on hold",
    description:
      "Hold parks a draft for later. It does not schedule or publish.",
  };
}

/**
 * Approved tab helper when drafts are waiting. Schedule is a separate yes.
 */
export function approvedScheduleHelp(options: {
  possibleLiveWriteCount: number;
}): string {
  if (options.possibleLiveWriteCount > 0) {
    return (
      "Schedule is a separate yes. Check Facebook / Instagram / YouTube first. " +
      "This does not publish."
    );
  }
  return (
    "Schedule is a separate yes. It does not publish until the worker runs " +
    "against a connected Facebook, Instagram, or YouTube account."
  );
}

/**
 * Schedule queues a worker job. It is not a live post.
 * After POSSIBLE_LIVE_WRITE, "still not live" skips the previous write.
 */
export function scheduleSuccessToast(options: {
  possibleLiveWrite: boolean;
}): string {
  if (options.possibleLiveWrite) {
    return (
      "Scheduled. This job does not publish until the worker runs. " +
      "A previous Facebook / Instagram / YouTube write may already be live. " +
      "This action did not publish."
    );
  }
  return "Scheduled. Still not live until the worker runs against a connected Facebook, Instagram, or YouTube account.";
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
