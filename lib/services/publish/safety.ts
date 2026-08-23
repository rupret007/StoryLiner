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

export function canRescheduleJob(jobStatus: string | null | undefined): boolean {
  return jobStatus == null || jobStatus === "PENDING";
}
