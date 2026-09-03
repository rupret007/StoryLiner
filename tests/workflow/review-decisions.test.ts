import { reviewDraftSchema } from "@/lib/schemas/content";
import {
  assertCanApproveDraft,
  assertCanArchiveDraft,
  assertCanDenyDraft,
  assertCanDuplicateDraft,
  assertCanGenerateForPlatform,
  assertCanHoldDraft,
  assertCanMutateDraftCaption,
} from "@/lib/services/publish/safety";

describe("reviewDraftSchema", () => {
  it("accepts Approve, Hold, and Deny as first-class actions", () => {
    for (const action of ["approve", "hold", "deny"] as const) {
      const result = reviewDraftSchema.safeParse({
        draftId: "clhf5gt0000000test0draftid1",
        action,
      });
      expect(result.success).toBe(true);
    }
  });

  it("still accepts reject as an alias token", () => {
    const result = reviewDraftSchema.safeParse({
      draftId: "clhf5gt0000000test0draftid1",
      action: "reject",
    });
    expect(result.success).toBe(true);
  });
});

describe("Approve / Hold / Deny never imply publish", () => {
  it("Approve from IN_REVIEW is allowed and is not a publish status", () => {
    const result = assertCanApproveDraft({ status: "IN_REVIEW", riskLevel: "LOW" });
    expect(result).toEqual({ ok: true });
  });

  it("Hold and Deny are allowed from IN_REVIEW", () => {
    expect(assertCanHoldDraft({ status: "IN_REVIEW" }).ok).toBe(true);
    expect(assertCanDenyDraft({ status: "IN_REVIEW" }).ok).toBe(true);
  });

  it("cannot Hold or Deny a post that is already publishing", () => {
    expect(assertCanHoldDraft({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanDenyDraft({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("cannot rewrite or edit a scheduled or published draft", () => {
    expect(assertCanMutateDraftCaption({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanMutateDraftCaption({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("cannot copy a scheduled or published draft", () => {
    expect(assertCanDuplicateDraft({ status: "APPROVED" }).ok).toBe(true);
    expect(assertCanDuplicateDraft({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanDuplicateDraft({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("cannot archive a scheduled or published draft", () => {
    expect(assertCanArchiveDraft({ status: "APPROVED" }).ok).toBe(true);
    expect(assertCanArchiveDraft({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanArchiveDraft({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("cannot generate leftover-platform drafts", () => {
    expect(assertCanGenerateForPlatform("FACEBOOK").ok).toBe(true);
    expect(assertCanGenerateForPlatform("INSTAGRAM").ok).toBe(true);
    expect(assertCanGenerateForPlatform("YOUTUBE").ok).toBe(true);
    expect(assertCanGenerateForPlatform("TWITTER").ok).toBe(false);
    expect(assertCanGenerateForPlatform("TIKTOK").ok).toBe(false);
    expect(assertCanGenerateForPlatform("TWITTER").reason).toMatch(/No real X adapter/i);
  });
});
