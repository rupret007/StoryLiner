import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  approveHighRiskConfirmDescription,
  approveSuccessToast,
  approvedEmptyState,
  approvedQueueTabLabel,
  approvedScheduleHelp,
  assertLivePublishResult,
  draftHasPossibleLiveWrite,
  stripPossibleLiveWriteNote,
  withPossibleLiveWriteNote,
  assertReadyForLivePublish,
  assertSafeToLivePublish,
  canRescheduleJob,
  captionMutationSuccessToast,
  needsReviewEmptyState,
  scheduleSuccessToast,
  shouldOpenApprovedTabAfterApprove,
  shouldOpenHeldTabAfterHold,
  hasYouTubeVideoUrl,
  isCleanPendingScheduleJob,
  isFailedWriteStartedSchedule,
  isLiveDestinationPlatform,
  isQueuedUpcomingSchedule,
  scheduleQueueHeadline,
  scheduledPostsEmptyState,
  upcomingScheduleBadge,
  dashboardFailedWriteStartedNote,
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

  it("does not count FAILED + write-started as a queued upcoming post", () => {
    expect(
      isQueuedUpcomingSchedule({
        jobStatus: "FAILED",
        adapterWriteStarted: true,
      })
    ).toBe(false);
    expect(
      isQueuedUpcomingSchedule({
        jobStatus: "PENDING",
        adapterWriteStarted: true,
      })
    ).toBe(false);
    expect(
      isQueuedUpcomingSchedule({
        jobStatus: "PENDING",
        adapterWriteStarted: false,
      })
    ).toBe(true);
    expect(
      isQueuedUpcomingSchedule({
        jobStatus: "FAILED",
        adapterWriteStarted: false,
      })
    ).toBe(false);

    expect(
      isFailedWriteStartedSchedule({
        jobStatus: "FAILED",
        adapterWriteStarted: true,
      })
    ).toBe(true);
    expect(
      isFailedWriteStartedSchedule({
        jobStatus: "PENDING",
        adapterWriteStarted: true,
      })
    ).toBe(true);
    expect(
      isFailedWriteStartedSchedule({
        jobStatus: "RUNNING",
        adapterWriteStarted: true,
      })
    ).toBe(false);

    expect(
      scheduleQueueHeadline({ queued: 2, failedWriteStarted: 0 })
    ).toBe("2 posts queued");
    expect(
      scheduleQueueHeadline({ queued: 1, failedWriteStarted: 2 })
    ).toMatch(/1 post queued/);
    expect(
      scheduleQueueHeadline({ queued: 1, failedWriteStarted: 2 })
    ).toMatch(/2 failed writes — check Facebook \/ Instagram \/ YouTube/);
    expect(
      scheduleQueueHeadline({ queued: 0, failedWriteStarted: 1 })
    ).toBe(
      "0 posts queued · 1 failed write — check Facebook / Instagram / YouTube"
    );

    expect(
      upcomingScheduleBadge({
        jobStatus: "FAILED",
        adapterWriteStarted: true,
      })
    ).toEqual({ label: "Publish failed", variant: "destructive" });
    expect(
      upcomingScheduleBadge({
        jobStatus: "PENDING",
        adapterWriteStarted: false,
      })
    ).toEqual({ label: "Post", variant: "info" });
    expect(
      upcomingScheduleBadge({
        jobStatus: "RUNNING",
        adapterWriteStarted: true,
      })
    ).toEqual({ label: "Publishing", variant: "warning" });

    expect(dashboardFailedWriteStartedNote(0)).toBeNull();
    expect(dashboardFailedWriteStartedNote(1)).toMatch(/may already be live/i);
    expect(dashboardFailedWriteStartedNote(1)).toMatch(/not a queued publish/i);
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

describe("Review → Approve → Schedule leftover copy", () => {
  it("Approve after a possible live write is not a clean ready-to-schedule", () => {
    const writeStarted = approveSuccessToast({ possibleLiveWrite: true });
    expect(writeStarted).not.toMatch(/Ready to Schedule/i);
    expect(writeStarted).not.toMatch(/schedule it from the Approved tab/i);
    expect(writeStarted).toMatch(/may already be live/i);
    expect(writeStarted).toMatch(/does not publish/i);
    expect(writeStarted).toMatch(/Check the platform/i);

    expect(approveSuccessToast({ possibleLiveWrite: false })).toMatch(
      /schedule it from the Approved tab/i
    );
  });

  it("high-risk Approve dialog keeps the platform check after a possible live write", () => {
    expect(approveHighRiskConfirmDescription({ possibleLiveWrite: true })).toMatch(
      /may already be live/i
    );
    expect(approveHighRiskConfirmDescription({ possibleLiveWrite: true })).toMatch(
      /check the platform/i
    );
    expect(approveHighRiskConfirmDescription({ possibleLiveWrite: false })).toMatch(
      /schedule it separately/i
    );
    expect(approveHighRiskConfirmDescription({ possibleLiveWrite: false })).not.toMatch(
      /may already be live/i
    );
  });

  it("Approved tab does not say Ready to Schedule when a write may already be live", () => {
    expect(
      approvedQueueTabLabel({ count: 2, possibleLiveWriteCount: 0 })
    ).toBe("Approved — Ready to Schedule (2)");
    expect(
      approvedQueueTabLabel({ count: 2, possibleLiveWriteCount: 1 })
    ).toBe("Approved — Check platform before schedule (2)");
    expect(
      approvedQueueTabLabel({ count: 1, possibleLiveWriteCount: 1 })
    ).not.toMatch(/Ready to Schedule/i);
  });

  it("Edit / Rewrite of an approved draft is not still-approved and is not publish", () => {
    const editApproved = captionMutationSuccessToast({
      kind: "edit",
      fromStatus: "APPROVED",
      possibleLiveWrite: false,
    });
    expect(editApproved).toMatch(/Back in Needs Review/i);
    expect(editApproved).toMatch(/approve again/i);
    expect(editApproved).toMatch(/does not publish/i);
    expect(editApproved).not.toMatch(/Ready to Schedule/i);

    const rewriteLive = captionMutationSuccessToast({
      kind: "rewrite",
      fromStatus: "APPROVED",
      possibleLiveWrite: true,
    });
    expect(rewriteLive).toMatch(/Rewrite applied/i);
    expect(rewriteLive).toMatch(/Back in Needs Review/i);
    expect(rewriteLive).toMatch(/may already be live/i);
    expect(rewriteLive).toMatch(/does not publish/i);

    expect(
      captionMutationSuccessToast({
        kind: "edit",
        fromStatus: "IN_REVIEW",
        possibleLiveWrite: false,
      })
    ).toBe("Caption updated.");
    expect(
      captionMutationSuccessToast({
        kind: "rewrite",
        fromStatus: "IN_REVIEW",
        possibleLiveWrite: false,
      })
    ).toMatch(/Review the updated caption/i);
  });

  it("Edit / Rewrite of a held draft says it moved back to Needs Review", () => {
    const editHeld = captionMutationSuccessToast({
      kind: "edit",
      fromStatus: "HELD",
      possibleLiveWrite: false,
    });
    expect(editHeld).toMatch(/Caption updated/i);
    expect(editHeld).toMatch(/Back in Needs Review/i);
    expect(editHeld).toMatch(/does not publish/i);
    expect(editHeld).not.toMatch(/Ready to Schedule/i);

    const rewriteHeldLive = captionMutationSuccessToast({
      kind: "rewrite",
      fromStatus: "HELD",
      possibleLiveWrite: true,
    });
    expect(rewriteHeldLive).toMatch(/Rewrite applied/i);
    expect(rewriteHeldLive).toMatch(/Back in Needs Review/i);
    expect(rewriteHeldLive).toMatch(/may already be live/i);
    expect(rewriteHeldLive).toMatch(/does not publish/i);
  });
});

describe("Review → Approve → Schedule handoff after #14", () => {
  it("Needs Review empty is not Queue is clear while Approved still needs a schedule yes", () => {
    const waiting = needsReviewEmptyState({
      approvedCount: 2,
      heldCount: 0,
      possibleLiveWriteCount: 0,
    });
    expect(waiting.title).toBe("Needs Review is empty");
    expect(waiting.description).toMatch(/2 approved drafts still waiting for a schedule yes/i);
    expect(waiting.description).toMatch(/Open the Approved tab/i);
    expect(waiting.description).toMatch(/does not publish/i);
    expect(waiting.title).not.toMatch(/Queue is clear/i);
    expect(waiting.description).not.toMatch(/No Bob drafts waiting for Jeff/i);

    const writeStarted = needsReviewEmptyState({
      approvedCount: 1,
      heldCount: 0,
      possibleLiveWriteCount: 1,
    });
    expect(writeStarted.description).toMatch(/1 approved draft still waiting for a schedule yes/i);
    expect(writeStarted.description).toMatch(/Check Facebook \/ Instagram \/ YouTube/i);
    expect(writeStarted.description).not.toMatch(/Queue is clear/i);

    const heldOnly = needsReviewEmptyState({
      approvedCount: 0,
      heldCount: 1,
      possibleLiveWriteCount: 0,
    });
    expect(heldOnly.title).toBe("Needs Review is empty");
    expect(heldOnly.description).toMatch(/on hold/i);
    expect(heldOnly.description).toMatch(/is not publish/i);
    expect(heldOnly.title).not.toMatch(/Queue is clear/i);

    const idle = needsReviewEmptyState({
      approvedCount: 0,
      heldCount: 0,
      possibleLiveWriteCount: 0,
    });
    expect(idle.title).toBe("Nothing needs review");
    expect(idle.description).toMatch(/review yes/i);
    expect(idle.title).not.toMatch(/Queue is clear/i);
  });

  it("Approved tab says Schedule is a separate yes and is not publish", () => {
    expect(approvedScheduleHelp({ possibleLiveWriteCount: 0 })).toMatch(
      /Schedule is a separate yes/i
    );
    expect(approvedScheduleHelp({ possibleLiveWriteCount: 0 })).toMatch(
      /does not publish/i
    );
    expect(approvedScheduleHelp({ possibleLiveWriteCount: 0 })).not.toMatch(
      /Queue is clear/i
    );

    const writeStarted = approvedScheduleHelp({ possibleLiveWriteCount: 1 });
    expect(writeStarted).toMatch(/Check Facebook \/ Instagram \/ YouTube/i);
    expect(writeStarted).toMatch(/does not publish/i);
    expect(writeStarted).not.toMatch(/Ready to Schedule/i);
  });

  it("Schedule after a possible live write is not still not live", () => {
    const writeStarted = scheduleSuccessToast({ possibleLiveWrite: true });
    expect(writeStarted).not.toMatch(/Still not live/i);
    expect(writeStarted).toMatch(/may already be live/i);
    expect(writeStarted).toMatch(/did not publish/i);
    expect(writeStarted).toMatch(/does not publish until the worker runs/i);

    expect(scheduleSuccessToast({ possibleLiveWrite: false })).toMatch(
      /Still not live until the worker runs/i
    );
    expect(scheduleSuccessToast({ possibleLiveWrite: false })).not.toMatch(
      /may already be live/i
    );
  });

  it("opens Approved after the last review yes and stays when more review remains", () => {
    expect(
      shouldOpenApprovedTabAfterApprove({
        currentTab: "review",
        remainingNeedsReviewCount: 0,
      })
    ).toBe(true);
    expect(
      shouldOpenApprovedTabAfterApprove({
        currentTab: "review",
        remainingNeedsReviewCount: 1,
      })
    ).toBe(false);
    expect(
      shouldOpenApprovedTabAfterApprove({
        currentTab: "held",
        remainingNeedsReviewCount: 0,
      })
    ).toBe(false);
  });
});

describe("Approved empty after last schedule after #15", () => {
  it("Approved empty is not approve-then-schedule while Needs Review still has work", () => {
    const waiting = approvedEmptyState({
      inReviewCount: 2,
      heldCount: 0,
      possibleLiveWriteCount: 0,
    });
    expect(waiting.title).toBe("Approved is empty");
    expect(waiting.description).toMatch(/2 Bob drafts still waiting for a review yes/i);
    expect(waiting.description).toMatch(/Open Needs Review/i);
    expect(waiting.description).toMatch(/Approve is not publish/i);
    expect(waiting.description).not.toMatch(/then schedule it here/i);
    expect(waiting.title).not.toMatch(/No approved drafts/i);
    expect(waiting.title).not.toMatch(/Queue is clear/i);

    const writeStarted = approvedEmptyState({
      inReviewCount: 1,
      heldCount: 0,
      possibleLiveWriteCount: 1,
    });
    expect(writeStarted.description).toMatch(/1 Bob draft still waiting for a review yes/i);
    expect(writeStarted.description).toMatch(/Check Facebook \/ Instagram \/ YouTube/i);
    expect(writeStarted.description).not.toMatch(/then schedule it here/i);
  });

  it("Approved empty names On Hold when a hold is what emptied the tab", () => {
    const heldOnly = approvedEmptyState({
      inReviewCount: 0,
      heldCount: 1,
      possibleLiveWriteCount: 0,
    });
    expect(heldOnly.title).toBe("Approved is empty");
    expect(heldOnly.description).toMatch(/on hold/i);
    expect(heldOnly.description).toMatch(/is not publish/i);
    expect(heldOnly.description).toMatch(/On Hold tab/i);
    expect(heldOnly.description).not.toMatch(/then schedule it here/i);

    const writeStarted = approvedEmptyState({
      inReviewCount: 0,
      heldCount: 2,
      possibleLiveWriteCount: 1,
    });
    expect(writeStarted.description).toMatch(/2 drafts on hold/i);
    expect(writeStarted.description).toMatch(/Check Facebook \/ Instagram \/ YouTube/i);
  });

  it("idle Approved empty points at Scheduled Posts and is not a clean approve-then-schedule", () => {
    const idle = approvedEmptyState({
      inReviewCount: 0,
      heldCount: 0,
      possibleLiveWriteCount: 0,
    });
    expect(idle.title).toBe("Nothing waiting to schedule");
    expect(idle.description).toMatch(/schedule yes/i);
    expect(idle.description).toMatch(/Scheduled Posts/i);
    expect(idle.description).toMatch(/does not publish/i);
    expect(idle.title).not.toMatch(/No approved drafts/i);
    expect(idle.description).not.toMatch(/then schedule it here/i);
    expect(idle.description).not.toMatch(/Queue is clear/i);
    expect(idle.description).not.toMatch(/Ready to Schedule/i);
    expect(idle.description).not.toMatch(/Still not live/i);
  });

  it("opens On Hold after the last Approved hold and stays when more approved remain", () => {
    expect(
      shouldOpenHeldTabAfterHold({
        currentTab: "approved",
        remainingApprovedCount: 0,
      })
    ).toBe(true);
    expect(
      shouldOpenHeldTabAfterHold({
        currentTab: "approved",
        remainingApprovedCount: 1,
      })
    ).toBe(false);
    expect(
      shouldOpenHeldTabAfterHold({
        currentTab: "review",
        remainingApprovedCount: 0,
      })
    ).toBe(false);
  });
});

describe("Scheduled Posts empty after the last schedule yes", () => {
  it("names the completed post below instead of asking for another Approve", () => {
    const completed = scheduledPostsEmptyState({ recentlyPublishedCount: 1 });

    expect(completed.title).toBe("No worker jobs waiting");
    expect(completed.description).toMatch(
      /1 scheduled post is in Recently published below/i
    );
    expect(completed.description).toMatch(
      /No second Approve or schedule yes is needed/i
    );
    expect(completed.description).toMatch(/does not publish/i);
    expect(completed.description).not.toMatch(/Approve a Bob draft/i);
    expect(completed.description).not.toMatch(/then schedule it here/i);

    const completedPair = scheduledPostsEmptyState({
      recentlyPublishedCount: 2,
    });
    expect(completedPair.description).toMatch(
      /2 scheduled posts are in Recently published below/i
    );
  });

  it("keeps a fresh queue neutral and wires the visible page to this contract", () => {
    const fresh = scheduledPostsEmptyState({ recentlyPublishedCount: 0 });

    expect(fresh.title).toBe("No worker jobs waiting");
    expect(fresh.description).toMatch(/New schedules start from the Approved tab/i);
    expect(fresh.description).toMatch(/does not approve, schedule, or publish/i);
    expect(fresh.description).not.toMatch(/Approve a Bob draft/i);
    expect(fresh.description).not.toMatch(/then schedule it here/i);

    const pageSource = readFileSync(
      join(__dirname, "../../app/(app)/scheduled-posts/page.tsx"),
      "utf8"
    );
    expect(pageSource).toMatch(
      /scheduledPostsEmptyState\(\{\s*recentlyPublishedCount: past\.length,\s*\}\)/
    );
    expect(pageSource).not.toMatch(
      /Approve a Bob draft in the review queue, then schedule it here/i
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
