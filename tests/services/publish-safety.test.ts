import {
  assertCanApproveDraft,
  assertCanDenyDraft,
  assertCanDuplicateDraft,
  assertCanHoldDraft,
  assertCanMutateDraftCaption,
  assertCanResumeHeldDraft,
  assertCanReturnFailedSchedule,
  assertCanReturnScheduleToApproved,
  assertCanScheduleAfterPossibleLiveWrite,
  assertLivePublishResult,
  draftHasPossibleLiveWrite,
  stripPossibleLiveWriteNote,
  withPossibleLiveWriteNote,
  assertReadyForLivePublish,
  assertSafeToLivePublish,
  canRescheduleJob,
  hasYouTubeVideoUrl,
  isCleanPendingScheduleJob,
  isLiveDestinationPlatform,
  mergeReviewNotesPreservingPossibleLiveWrite,
  POSSIBLE_LIVE_WRITE_NOTE,
  returnScheduleButtonLabel,
  returnScheduleSuccessToast,
  reviewNotesForDuplicateDraft,
  duplicateDraftSuccessToast,
  denyConfirmDescription,
  denySuccessToast,
  holdConfirmDescription,
  holdSuccessToast,
  honestJobFailureMessage,
  resumeHeldSuccessToast,
  sanitizeMediaUrls,
  unscheduleJobErrorMessage,
  writeStartedQueueWarning,
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
    expect(hasYouTubeVideoUrl(["https://www.youtube.com/shorts/abcdefghijk"])).toBe(true);
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

  it("allows only successful non-draft writes that include an external post id", () => {
    expect(
      assertLivePublishResult({
        success: true,
        isDraftOnly: false,
        externalPostId: "ext_1",
      })
    ).toEqual({
      ok: true,
    });
  });

  it("refuses success without an external post id", () => {
    const result = assertLivePublishResult({
      success: true,
      isDraftOnly: false,
      externalPostId: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/external post id/i);
    }
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

  it("blocks caption edits on SCHEDULED and PUBLISHED drafts", () => {
    expect(assertCanMutateDraftCaption({ status: "IN_REVIEW" })).toEqual({ ok: true });
    expect(assertCanMutateDraftCaption({ status: "HELD" })).toEqual({ ok: true });
    expect(assertCanMutateDraftCaption({ status: "APPROVED" })).toEqual({ ok: true });
    expect(assertCanMutateDraftCaption({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanMutateDraftCaption({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("refuses Copy of SCHEDULED or PUBLISHED drafts", () => {
    expect(assertCanDuplicateDraft({ status: "IN_REVIEW" })).toEqual({ ok: true });
    expect(assertCanDuplicateDraft({ status: "HELD" })).toEqual({ ok: true });
    expect(assertCanDuplicateDraft({ status: "APPROVED" })).toEqual({ ok: true });
    expect(assertCanDuplicateDraft({ status: "REJECTED" })).toEqual({ ok: true });
    expect(assertCanDuplicateDraft({ status: "ARCHIVED" })).toEqual({ ok: true });
    expect(assertCanDuplicateDraft({ status: "SCHEDULED" }).ok).toBe(false);
    expect(assertCanDuplicateDraft({ status: "PUBLISHED" }).ok).toBe(false);
  });

  it("only returns a failed schedule to Approved", () => {
    expect(
      assertCanReturnFailedSchedule({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "FAILED",
      })
    ).toEqual({ ok: true });
    expect(
      assertCanReturnFailedSchedule({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "PENDING",
      }).ok
    ).toBe(false);
    expect(
      assertCanReturnFailedSchedule({
        scheduledStatus: "PUBLISHED",
        draftStatus: "PUBLISHED",
        jobStatus: "DONE",
      }).ok
    ).toBe(false);
  });

  it("allows unscheduling a pending job that has not reached the adapter", () => {
    expect(
      assertCanReturnScheduleToApproved({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "PENDING",
        adapterWriteStarted: false,
      })
    ).toEqual({ ok: true });
  });

  it("refuses to Unschedule a write-started PENDING job without a platform check", () => {
    const blocked = assertCanReturnScheduleToApproved({
      scheduledStatus: "SCHEDULED",
      draftStatus: "SCHEDULED",
      jobStatus: "PENDING",
      adapterWriteStarted: true,
      confirmCheckedPlatform: false,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toMatch(/Check the platform/i);
    }

    expect(
      assertCanReturnScheduleToApproved({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "PENDING",
        adapterWriteStarted: true,
        confirmCheckedPlatform: true,
      })
    ).toEqual({ ok: true });
  });

  it("refuses to return a write-started failure without a platform check", () => {
    const blocked = assertCanReturnScheduleToApproved({
      scheduledStatus: "SCHEDULED",
      draftStatus: "SCHEDULED",
      jobStatus: "FAILED",
      adapterWriteStarted: true,
      confirmCheckedPlatform: false,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toMatch(/Check the platform/i);
    }

    expect(
      assertCanReturnScheduleToApproved({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "FAILED",
        adapterWriteStarted: true,
        confirmCheckedPlatform: true,
      })
    ).toEqual({ ok: true });
  });

  it("refuses RUNNING jobs so a live write cannot be yanked mid-flight", () => {
    expect(
      assertCanReturnScheduleToApproved({
        scheduledStatus: "SCHEDULED",
        draftStatus: "SCHEDULED",
        jobStatus: "RUNNING",
        adapterWriteStarted: true,
        confirmCheckedPlatform: true,
      }).ok
    ).toBe(false);
  });
});

describe("possible live write notes", () => {
  it("requires confirm before scheduling again", () => {
    const blocked = assertCanScheduleAfterPossibleLiveWrite({
      possibleLiveWrite: true,
      confirmCheckedNoLivePost: false,
    });
    expect(blocked.ok).toBe(false);

    expect(
      assertCanScheduleAfterPossibleLiveWrite({
        possibleLiveWrite: true,
        confirmCheckedNoLivePost: true,
      })
    ).toEqual({ ok: true });
  });

  it("round-trips the sentinel on review notes", () => {
    const noted = withPossibleLiveWriteNote("Held from review queue.");
    expect(draftHasPossibleLiveWrite(noted)).toBe(true);
    expect(stripPossibleLiveWriteNote(noted)).toBe("Held from review queue.");
    expect(draftHasPossibleLiveWrite(stripPossibleLiveWriteNote(noted))).toBe(false);
  });

  it("Hold / Approve cannot erase POSSIBLE_LIVE_WRITE", () => {
    const existing = withPossibleLiveWriteNote("Returned from a failed publish job.");
    const held = mergeReviewNotesPreservingPossibleLiveWrite(
      existing,
      "Held from review queue. Approve does not publish."
    );
    expect(typeof held).toBe("string");
    expect(draftHasPossibleLiveWrite(held)).toBe(true);
    expect(held).toContain("Held from review queue");

    const approved = mergeReviewNotesPreservingPossibleLiveWrite(held, "Looks good.");
    expect(draftHasPossibleLiveWrite(approved)).toBe(true);
    expect(approved).toContain("Looks good.");

    expect(
      mergeReviewNotesPreservingPossibleLiveWrite(existing, undefined)
    ).toBe(existing);
    expect(
      mergeReviewNotesPreservingPossibleLiveWrite(null, undefined)
    ).toBeUndefined();
    expect(
      mergeReviewNotesPreservingPossibleLiveWrite(null, "Held from review queue.")
    ).toBe("Held from review queue.");
    expect(mergeReviewNotesPreservingPossibleLiveWrite(null, "")).toBeNull();
    expect(draftHasPossibleLiveWrite(POSSIBLE_LIVE_WRITE_NOTE)).toBe(true);
  });

  it("Copy keeps POSSIBLE_LIVE_WRITE so schedule still requires a platform check", () => {
    const existing = withPossibleLiveWriteNote("Returned from a failed publish job.");
    const copied = reviewNotesForDuplicateDraft(existing);
    expect(typeof copied).toBe("string");
    expect(draftHasPossibleLiveWrite(copied)).toBe(true);
    expect(copied).toMatch(/Copy is not publish/i);
    expect(reviewNotesForDuplicateDraft("Looks good.")).toBeUndefined();
    expect(reviewNotesForDuplicateDraft(null)).toBeUndefined();
  });

  it("never claims Copy is a clean new draft after a possible live write", () => {
    const writeStarted = duplicateDraftSuccessToast({ possibleLiveWrite: true });
    expect(writeStarted).not.toMatch(/Find the copy in the In Review tab/i);
    expect(writeStarted).toMatch(/may already be live/i);
    expect(writeStarted).toMatch(/Copy is not publish/i);

    expect(duplicateDraftSuccessToast({ possibleLiveWrite: false })).toMatch(
      /In Review/i
    );
  });
});

describe("Unschedule vs write-started copy", () => {
  it("only calls a job Unschedule while it is a clean pending write", () => {
    expect(
      isCleanPendingScheduleJob({ jobStatus: "PENDING", adapterWriteStarted: false })
    ).toBe(true);
    expect(
      isCleanPendingScheduleJob({ jobStatus: "PENDING", adapterWriteStarted: true })
    ).toBe(false);
    expect(
      isCleanPendingScheduleJob({ jobStatus: "FAILED", adapterWriteStarted: false })
    ).toBe(false);

    expect(
      returnScheduleButtonLabel({ jobStatus: "PENDING", adapterWriteStarted: false })
    ).toBe("Unschedule");
    expect(
      returnScheduleButtonLabel({ jobStatus: "PENDING", adapterWriteStarted: true })
    ).toBe("Return to Approved");
    expect(
      returnScheduleButtonLabel({ jobStatus: "FAILED", adapterWriteStarted: true })
    ).toBe("Return to Approved");
  });

  it("never claims nothing was published after a write started", () => {
    const writeStarted = returnScheduleSuccessToast({
      jobStatus: "PENDING",
      adapterWriteStarted: true,
    });
    expect(writeStarted).not.toMatch(/Nothing was published/i);
    expect(writeStarted).toMatch(/may already be live/i);

    expect(
      returnScheduleSuccessToast({
        jobStatus: "PENDING",
        adapterWriteStarted: false,
      })
    ).toMatch(/Unscheduled/i);
  });

  it("does not persist Nothing was published on a write-started Unschedule", () => {
    const writeStarted = unscheduleJobErrorMessage(true);
    expect(writeStarted).not.toMatch(/Nothing was published/i);
    expect(writeStarted).toMatch(/may already be live/i);
    expect(writeStarted).toMatch(/did not mark this published/i);

    expect(unscheduleJobErrorMessage(false)).toMatch(/Nothing was published/i);
  });
});

describe("queue notes after a possible live write", () => {
  it("never claims Hold / Deny / Resume cleared the platform", () => {
    expect(holdSuccessToast({ possibleLiveWrite: true })).not.toMatch(
      /Nothing was scheduled or published/i
    );
    expect(holdSuccessToast({ possibleLiveWrite: true })).toMatch(/may already be live/i);
    expect(holdSuccessToast({ possibleLiveWrite: false })).toMatch(
      /Nothing was scheduled or published/i
    );

    expect(denySuccessToast({ possibleLiveWrite: true })).not.toMatch(
      /Nothing was scheduled or published/i
    );
    expect(denySuccessToast({ possibleLiveWrite: true })).toMatch(/may already be live/i);
    expect(denySuccessToast({ possibleLiveWrite: false })).toMatch(
      /Nothing was scheduled or published/i
    );

    expect(resumeHeldSuccessToast({ possibleLiveWrite: true })).not.toMatch(
      /Still not published/i
    );
    expect(resumeHeldSuccessToast({ possibleLiveWrite: true })).toMatch(
      /may already be live/i
    );
    expect(resumeHeldSuccessToast({ possibleLiveWrite: false })).toMatch(
      /Still not published/i
    );
  });

  it("Hold / Deny dialogs keep the schedule gate after a possible live write", () => {
    expect(holdConfirmDescription({ possibleLiveWrite: true })).toMatch(
      /does not clear the schedule gate/i
    );
    expect(holdConfirmDescription({ possibleLiveWrite: true })).not.toMatch(
      /Nothing is scheduled or published/i
    );
    expect(holdConfirmDescription({ possibleLiveWrite: false })).toMatch(
      /Nothing is scheduled or published/i
    );

    expect(denyConfirmDescription({ possibleLiveWrite: true })).toMatch(
      /Copy keeps that warning/i
    );
    expect(denyConfirmDescription({ possibleLiveWrite: true })).not.toMatch(
      /It will not be scheduled or published/i
    );
    expect(denyConfirmDescription({ possibleLiveWrite: false })).toMatch(
      /will not be scheduled or published/i
    );
  });

  it("does not show Nothing was published on a write-started failed job", () => {
    const rewritten = honestJobFailureMessage({
      errorMessage:
        "Instagram video container is still processing. Nothing was published. Wait for Instagram.",
      adapterWriteStarted: true,
    });
    expect(rewritten).not.toMatch(/Nothing was published/i);
    expect(rewritten).toMatch(/still processing/i);
    expect(rewritten).toMatch(/did not mark this published/i);

    expect(
      honestJobFailureMessage({
        errorMessage: "Graph API rejected the write",
        adapterWriteStarted: true,
      })
    ).toBe("Graph API rejected the write");

    expect(
      honestJobFailureMessage({
        errorMessage: "Unscheduled by operator. Nothing was published.",
        adapterWriteStarted: false,
      })
    ).toMatch(/Nothing was published/i);

    expect(
      writeStartedQueueWarning({ jobFailed: true })
    ).not.toMatch(/Nothing was published/i);
    expect(writeStartedQueueWarning({ jobFailed: true })).toMatch(/may already be live/i);
    expect(writeStartedQueueWarning({ jobFailed: false })).toMatch(
      /Cannot Unschedule or Reschedule/i
    );
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

  it("refuses reschedule after the adapter write started", () => {
    expect(canRescheduleJob("PENDING", true)).toBe(false);
    expect(canRescheduleJob("FAILED", true)).toBe(false);
    expect(canRescheduleJob("PENDING", false)).toBe(true);
  });
});
