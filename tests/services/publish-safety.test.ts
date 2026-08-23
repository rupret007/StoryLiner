import {
  assertCanApproveDraft,
  assertCanDenyDraft,
  assertCanHoldDraft,
  assertCanResumeHeldDraft,
  assertLivePublishResult,
  assertReadyForLivePublish,
  assertSafeToLivePublish,
  canRescheduleJob,
  hasYouTubeVideoUrl,
  isLiveDestinationPlatform,
  sanitizeMediaUrls,
} from "@/lib/services/publish/safety";

describe("assertSafeToLivePublish", () => {
  it("allows mock-mode publish for disconnected seed accounts", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "mock",
      platform: "FACEBOOK",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses real Facebook publish when the account is not connected", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not connected/i);
    }
  });

  it("refuses real Facebook publish when the account is inactive", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: true,
      accountIsActive: false,
    });
    expect(result.ok).toBe(false);
  });

  it("allows real Facebook publish only after the account is connected", () => {
    const result = assertSafeToLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: true,
      accountIsActive: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it.each(["TWITTER", "TIKTOK", "BLUESKY", "TWITCH"] as const)(
    "refuses real-mode %s even if an account looks connected",
    (platform) => {
      const result = assertSafeToLivePublish({
        socialAdapterMode: "real",
        platform,
        accountIsConnected: true,
        accountIsActive: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/YouTube only/i);
        expect(result.reason).toMatch(new RegExp(platform, "i"));
      }
    }
  );
});

describe("sanitizeMediaUrls", () => {
  it("keeps unique public https URLs", () => {
    expect(
      sanitizeMediaUrls([
        "https://cdn.example.com/show.jpg",
        "https://cdn.example.com/show.jpg",
        "  https://cdn.example.com/poster.png  ",
      ])
    ).toEqual([
      "https://cdn.example.com/show.jpg",
      "https://cdn.example.com/poster.png",
    ]);
  });

  it("rejects http, data, javascript, and credentialed URLs", () => {
    expect(
      sanitizeMediaUrls([
        "http://insecure.example.com/x.jpg",
        "javascript:alert(1)",
        "data:image/png;base64,aaaa",
        "https://user:pass@cdn.example.com/x.jpg",
        "not a url",
        12,
        null,
      ])
    ).toEqual([]);
  });
});

describe("hasYouTubeVideoUrl", () => {
  it("accepts watch and short https YouTube URLs", () => {
    expect(hasYouTubeVideoUrl(["https://www.youtube.com/watch?v=abcdefghijk"])).toBe(true);
    expect(hasYouTubeVideoUrl(["https://youtu.be/abcdefghijk"])).toBe(true);
  });

  it("rejects non-YouTube https URLs", () => {
    expect(hasYouTubeVideoUrl(["https://example.com/video.mp4"])).toBe(false);
  });
});

describe("assertReadyForLivePublish", () => {
  it("allows mock Instagram without media so the demo queue still works", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "mock",
      platform: "INSTAGRAM",
      accountIsConnected: false,
      accountIsActive: true,
      mediaUrls: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses real Instagram without https media", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "INSTAGRAM",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: ["http://insecure.example.com/x.jpg"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/https/i);
    }
  });

  it("allows real Instagram when connected and media is https", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "INSTAGRAM",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: ["https://cdn.example.com/show.jpg"],
    });
    expect(result).toEqual({ ok: true });
  });

  it.each(["TWITTER", "TIKTOK", "BLUESKY", "TWITCH"] as const)(
    "refuses real-mode %s at the schedule/worker gate",
    (platform) => {
      const result = assertReadyForLivePublish({
        socialAdapterMode: "real",
        platform,
        accountIsConnected: true,
        accountIsActive: true,
        mediaUrls: ["https://cdn.example.com/show.jpg"],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/YouTube only/i);
      }
    }
  );

  it("refuses real YouTube without an allowed video URL", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "YOUTUBE",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: ["https://cdn.example.com/show.jpg"],
      accountMetadata: {},
    });
    expect(result.ok).toBe(false);
  });

  it("allows real YouTube only with a video URL and explicit allow flag", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "YOUTUBE",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: ["https://www.youtube.com/watch?v=abcdefghijk"],
      accountMetadata: { allowVideoDescriptionUpdate: true },
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("assertLivePublishResult", () => {
  it("refuses to treat draft-only adapter results as live", () => {
    const result = assertLivePublishResult({
      success: true,
      isDraftOnly: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/draft-only/i);
    }
  });

  it("refuses unsuccessful writes", () => {
    const result = assertLivePublishResult({
      success: false,
      errorMessage: "Instagram feed posts require a public https image or video URL.",
    });
    expect(result.ok).toBe(false);
  });

  it("allows only successful non-draft writes", () => {
    expect(assertLivePublishResult({ success: true, isDraftOnly: false })).toEqual({
      ok: true,
    });
  });
});

describe("assertCanApproveDraft", () => {
  it("requires extra confirm for high-risk drafts", () => {
    const blocked = assertCanApproveDraft({
      status: "IN_REVIEW",
      riskLevel: "HIGH",
      confirmHighRisk: false,
    });
    expect(blocked.ok).toBe(false);

    const allowed = assertCanApproveDraft({
      status: "IN_REVIEW",
      riskLevel: "HIGH",
      confirmHighRisk: true,
    });
    expect(allowed).toEqual({ ok: true });
  });

  it("still refuses approve from SCHEDULED or PUBLISHED", () => {
    expect(
      assertCanApproveDraft({ status: "SCHEDULED", riskLevel: "LOW" }).ok
    ).toBe(false);
  });

  it("allows approve from HELD so a parked draft can move to schedule", () => {
    expect(
      assertCanApproveDraft({ status: "HELD", riskLevel: "LOW" })
    ).toEqual({ ok: true });
  });
});

describe("review decisions do not publish", () => {
  it("allows Hold from IN_REVIEW or APPROVED only", () => {
    expect(assertCanHoldDraft({ status: "IN_REVIEW" })).toEqual({ ok: true });
    expect(assertCanHoldDraft({ status: "APPROVED" })).toEqual({ ok: true });
    expect(assertCanHoldDraft({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanHoldDraft({ status: "PUBLISHED" }).ok).toBe(false);
    expect(assertCanHoldDraft({ status: "REJECTED" }).ok).toBe(false);
  });

  it("allows Deny from IN_REVIEW or HELD only", () => {
    expect(assertCanDenyDraft({ status: "IN_REVIEW" })).toEqual({ ok: true });
    expect(assertCanDenyDraft({ status: "HELD" })).toEqual({ ok: true });
    expect(assertCanDenyDraft({ status: "APPROVED" }).ok).toBe(false);
    expect(assertCanDenyDraft({ status: "SCHEDULED" }).ok).toBe(false);
  });

  it("only resumes HELD drafts", () => {
    expect(assertCanResumeHeldDraft({ status: "HELD" })).toEqual({ ok: true });
    expect(assertCanResumeHeldDraft({ status: "IN_REVIEW" }).ok).toBe(false);
  });
});

describe("isLiveDestinationPlatform", () => {
  it("is true only for Facebook, Instagram, and YouTube", () => {
    expect(isLiveDestinationPlatform("FACEBOOK")).toBe(true);
    expect(isLiveDestinationPlatform("INSTAGRAM")).toBe(true);
    expect(isLiveDestinationPlatform("YOUTUBE")).toBe(true);
    expect(isLiveDestinationPlatform("TWITTER")).toBe(false);
    expect(isLiveDestinationPlatform("TIKTOK")).toBe(false);
    expect(isLiveDestinationPlatform("BLUESKY")).toBe(false);
  });
});

describe("canRescheduleJob", () => {
  it("allows reschedule when there is no job yet", () => {
    expect(canRescheduleJob(null)).toBe(true);
    expect(canRescheduleJob(undefined)).toBe(true);
  });

  it("allows reschedule only while the job is still PENDING", () => {
    expect(canRescheduleJob("PENDING")).toBe(true);
    expect(canRescheduleJob("RUNNING")).toBe(false);
    expect(canRescheduleJob("DONE")).toBe(false);
    expect(canRescheduleJob("FAILED")).toBe(false);
  });
});
