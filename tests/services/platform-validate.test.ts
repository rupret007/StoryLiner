import { validateDraftForPlatform } from "@/lib/services/publish/validate";
import type { Draft } from "@prisma/client";

function makeDraft(overrides: Partial<Draft>): Draft {
  return {
    id: "draft_test_01",
    bandId: "band_01",
    campaignId: null,
    platform: "INSTAGRAM",
    status: "APPROVED",
    toneVariant: "AUTHENTIC",
    contentLength: "MEDIUM",
    caption: "Playing Burlington Bar on Saturday.",
    hashtags: ["#chicago", "#livemusic"],
    ctaText: null,
    altText: null,
    imagePrompt: null,
    fanReplies: [],
    brandFitScore: 85,
    confidenceNotes: null,
    riskLevel: "LOW",
    riskFlags: [],
    reviewedAt: new Date(),
    reviewNotes: null,
    rejectedAt: null,
    rejectedReason: null,
    currentVersion: 1,
    generationRunId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("validateDraftForPlatform", () => {
  it("passes a valid Instagram draft", () => {
    const draft = makeDraft({ platform: "INSTAGRAM" });
    const result = validateDraftForPlatform(draft);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when caption exceeds Bluesky's 300 character limit", () => {
    const longCaption = "A".repeat(290) + " #chicago #livemusic";
    const draft = makeDraft({
      platform: "BLUESKY",
      caption: longCaption,
    });
    const result = validateDraftForPlatform(draft);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("character limit"))).toBe(true);
  });

  it("passes a short Bluesky draft", () => {
    const draft = makeDraft({
      platform: "BLUESKY",
      caption: "Playing Burlington Bar. Doors at 8.",
      hashtags: ["#chicago"],
    });
    const result = validateDraftForPlatform(draft);
    expect(result.isValid).toBe(true);
  });

  it("warns when too many hashtags for Instagram (>30)", () => {
    const draft = makeDraft({
      platform: "INSTAGRAM",
      hashtags: Array.from({ length: 35 }, (_, i) => `#tag${i}`),
    });
    const result = validateDraftForPlatform(draft);
    expect(result.warnings.some((w) => w.includes("hashtags"))).toBe(true);
  });

  it("warns on HIGH risk level", () => {
    const draft = makeDraft({ riskLevel: "HIGH" });
    const result = validateDraftForPlatform(draft);
    expect(result.warnings.some((w) => w.includes("risk flags"))).toBe(true);
  });

  it("warns on low brand fit score", () => {
    const draft = makeDraft({ brandFitScore: 45 });
    const result = validateDraftForPlatform(draft);
    expect(result.warnings.some((w) => w.includes("brand fit"))).toBe(true);
  });

  it("Facebook supports long captions", () => {
    const draft = makeDraft({
      platform: "FACEBOOK",
      caption: "A".repeat(5000),
      hashtags: [],
    });
    const result = validateDraftForPlatform(draft);
    expect(result.isValid).toBe(true);
  });

  it("Twitter fails when caption + hashtags exceed 280 chars", () => {
    const draft = makeDraft({
      platform: "TWITTER",
      caption: "A".repeat(270),
      hashtags: ["#chicago", "#livemusic", "#indie"],
    });
    const result = validateDraftForPlatform(draft);
    expect(result.isValid).toBe(false);
  });
});
