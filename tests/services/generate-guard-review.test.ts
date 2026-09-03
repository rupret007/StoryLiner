/**
 * Generate → Guard → Review handoff. The studio must show the guarded
 * snapshot and name the next review yes. Approve is not implied.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewDraftSchema, rewriteDraftSchema } from "@/lib/schemas/content";
import {
  generateSuccessHandoff,
  reviewCardNextAction,
  reviewCreativeFingerprint,
  reviewGuardBanner,
  reviewQueueFocusHref,
  reviewQueueTabForFocus,
  reviewSnapshotReceipt,
} from "@/lib/services/publish/review-snapshot";

const SNAPSHOT = {
  caption: "Thursday at The Hive. No rush.",
  hashtags: ["#stalemate"],
  mediaUrls: ["https://cdn.example.com/hive.jpg"],
  riskLevel: "LOW" as const,
  riskFlags: [] as string[],
  currentVersion: 1,
  updatedAt: new Date("2026-09-03T11:00:00.000Z"),
};

describe("generate → guard → review handoff", () => {
  it("names Needs Review as the next action and never publish", () => {
    const clean = generateSuccessHandoff({ riskLevel: "LOW", riskFlagCount: 0 });
    expect(clean.toast).toMatch(/Needs Review/i);
    expect(clean.toast).toMatch(/Guard ran/i);
    expect(clean.toast).toMatch(/Nothing was published/i);
    expect(clean.nextAction).toMatch(/Approve, Hold, or Deny/i);
    expect(clean.nextAction).toMatch(/None of them publish/i);
    expect(clean.guardSummary).toMatch(/Guard passed/i);
    expect(clean.guardSummary).toMatch(/still needs your review yes/i);
    expect(clean.guardSummary).toMatch(/did not publish/i);

    const flagged = generateSuccessHandoff({
      riskLevel: "HIGH",
      riskFlagCount: 3,
    });
    expect(flagged.guardSummary).toMatch(/Guard flagged this snapshot \(HIGH\)/i);
    expect(flagged.guardSummary).toMatch(/did not publish/i);
    expect(flagged.toast).not.toMatch(/approved/i);
    expect(flagged.nextAction).not.toMatch(/schedule/i);
  });

  it("always shows a guard banner so a clean pass is not an invisible skip", () => {
    const passed = reviewGuardBanner({ riskLevel: "LOW", riskFlags: [] });
    expect(passed.tone).toBe("pass");
    expect(passed.title).toMatch(/Guard passed/i);
    expect(passed.title).toMatch(/exact caption and media/i);
    expect(passed.title).toMatch(/Approve is not publish/i);
    expect(passed.details).toEqual([]);

    const flagged = reviewGuardBanner({
      riskLevel: "MEDIUM",
      riskFlags: ["LinkedIn-influencer phrase detected: \"excited to announce\""],
    });
    expect(flagged.tone).toBe("flag");
    expect(flagged.title).toMatch(/Guard flagged this snapshot \(MEDIUM\)/i);
    expect(flagged.details).toHaveLength(1);
  });

  it("makes the next review action obvious on every queue tab", () => {
    expect(reviewCardNextAction({ status: "IN_REVIEW" })).toMatch(
      /Approve, Hold, or Deny this snapshot/i
    );
    expect(reviewCardNextAction({ status: "IN_REVIEW" })).toMatch(
      /None of those publish/i
    );
    expect(reviewCardNextAction({ status: "HELD" })).toMatch(/Back to review/i);
    expect(reviewCardNextAction({ status: "APPROVED" })).toMatch(
      /Schedule is a separate yes/i
    );
    expect(reviewCardNextAction({ status: "APPROVED" })).not.toMatch(
      /Approve, Hold, or Deny this snapshot/i
    );
    expect(reviewCardNextAction({ status: "REJECTED" })).toMatch(/Denied/i);
    expect(reviewCardNextAction({ status: "REJECTED" })).toMatch(
      /did not publish/i
    );
  });

  it("opens the focused snapshot instead of a leftover empty tab", () => {
    expect(reviewQueueFocusHref("clhf5gt0000000test0draftid1")).toBe(
      "/review-queue?focus=clhf5gt0000000test0draftid1"
    );
    expect(reviewQueueTabForFocus("IN_REVIEW", "approved")).toBe("review");
    expect(reviewQueueTabForFocus("HELD", "review")).toBe("held");
    expect(reviewQueueTabForFocus("APPROVED", "review")).toBe("approved");
    expect(reviewQueueTabForFocus("REJECTED", "review")).toBe("denied");
    expect(reviewQueueTabForFocus(undefined, "review")).toBe("review");
  });

  it("fingerprints caption, media, guard, and version so unseen creative cannot match", () => {
    const receipt = reviewSnapshotReceipt(SNAPSHOT);
    expect(receipt.updatedAt).toBe("2026-09-03T11:00:00.000Z");
    expect(receipt.fingerprint).toBe(reviewCreativeFingerprint(SNAPSHOT));

    const rewritten = reviewCreativeFingerprint({
      ...SNAPSHOT,
      caption: "Rewritten caption Jeff has not seen.",
    });
    expect(rewritten).not.toBe(receipt.fingerprint);

    const newMedia = reviewCreativeFingerprint({
      ...SNAPSHOT,
      mediaUrls: ["https://cdn.example.com/other.jpg"],
    });
    expect(newMedia).not.toBe(receipt.fingerprint);
  });

  it("requires a review snapshot receipt on rewrite so a stale card cannot overwrite", () => {
    const valid = rewriteDraftSchema.safeParse({
      draftId: "clhf5gt0000000test0draftid1",
      directive: "funnier",
      reviewedSnapshot: reviewSnapshotReceipt(SNAPSHOT),
    });
    expect(valid.success).toBe(true);

    const missing = rewriteDraftSchema.safeParse({
      draftId: "clhf5gt0000000test0draftid1",
      directive: "funnier",
    });
    expect(missing.success).toBe(false);
  });

  it("does not add Fault Lines or a third-band voice on this leftover", () => {
    const voice = readFileSync(join(__dirname, "../../lib/services/llm/voice.ts"), "utf8");
    expect(voice).toMatch(/"stalemate" \| "rad-dad" \| "unknown"/);
    expect(voice).not.toMatch(/fault.?lines/i);
    expect(readFileSync(join(__dirname, "../../prisma/seed.ts"), "utf8")).not.toMatch(
      /fault.?lines/i
    );
  });

  it("keeps Approve / Hold / Deny as review-only schema actions", () => {
    for (const action of ["approve", "hold", "deny"] as const) {
      expect(
        reviewDraftSchema.safeParse({
          draftId: "clhf5gt0000000test0draftid1",
          action,
        }).success
      ).toBe(true);
    }
  });
});
