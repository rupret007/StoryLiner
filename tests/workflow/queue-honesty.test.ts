/**
 * Queue honesty after a possible live write.
 * Prisma is mocked — CI never hits a database. Hold / Approve / Copy /
 * Reschedule / Return must stay fail-closed.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  draftVersion: {
    create: jest.fn(),
  },
  scheduledPost: {
    findUniqueOrThrow: jest.fn(),
    delete: jest.fn(),
  },
  job: {
    updateMany: jest.fn(),
  },
  band: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  approveDraft,
  duplicateDraft,
  holdDraft,
  reschedulePost,
  returnScheduleToApproved,
  updateDraftCaption,
} from "@/app/(app)/review-queue/actions";
import { POSSIBLE_LIVE_WRITE_MARKER } from "@/lib/services/publish/safety";

function approvedDraft(reviewNotes: string | null) {
  return {
    id: "draft_1",
    status: "APPROVED",
    riskLevel: "LOW",
    reviewNotes,
  };
}

function scheduledRow(options: {
  jobStatus: "PENDING" | "FAILED";
  adapterWriteStarted: boolean;
  reviewNotes?: string | null;
}) {
  return {
    id: "sched_1",
    status: "SCHEDULED",
    draftId: "draft_1",
    jobId: "job_1",
    job: {
      id: "job_1",
      status: options.jobStatus,
      payload: {
        scheduledPostId: "sched_1",
        adapterWriteStarted: options.adapterWriteStarted,
      },
      maxRetries: 3,
    },
    draft: {
      id: "draft_1",
      status: "SCHEDULED",
      reviewNotes: options.reviewNotes ?? null,
    },
  };
}

describe("queue honesty after a possible live write", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.update.mockResolvedValue({ id: "draft_1" });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
  });

  it("Hold keeps POSSIBLE_LIVE_WRITE so schedule still requires a platform check", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      approvedDraft(`${POSSIBLE_LIVE_WRITE_MARKER} check Facebook first`)
    );

    await holdDraft("draft_1");

    expect(prismaMock.draft.update).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: {
        status: "HELD",
        reviewNotes: expect.stringContaining(POSSIBLE_LIVE_WRITE_MARKER),
      },
    });
    const notes = prismaMock.draft.update.mock.calls[0][0].data.reviewNotes as string;
    expect(notes).toMatch(/Held from review queue/);
  });

  it("Approve with new notes keeps POSSIBLE_LIVE_WRITE", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      ...approvedDraft(`${POSSIBLE_LIVE_WRITE_MARKER} check Instagram first`),
      status: "HELD",
    });

    await approveDraft("draft_1", "Looks good after the hold.");

    expect(prismaMock.draft.update).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: {
        status: "APPROVED",
        reviewedAt: expect.any(Date),
        reviewNotes: expect.stringContaining(POSSIBLE_LIVE_WRITE_MARKER),
      },
    });
    const notes = prismaMock.draft.update.mock.calls[0][0].data.reviewNotes as string;
    expect(notes).toContain("Looks good after the hold.");
  });

  it("refuses Reschedule after the adapter write started", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
      scheduledRow({ jobStatus: "PENDING", adapterWriteStarted: true })
    );

    await expect(
      reschedulePost("sched_1", new Date(Date.now() + 60 * 60 * 1000).toISOString())
    ).rejects.toThrow(/write started/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses Unschedule of a write-started PENDING job without a platform check", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
      scheduledRow({ jobStatus: "PENDING", adapterWriteStarted: true })
    );

    await expect(returnScheduleToApproved("sched_1", false)).rejects.toThrow(
      /Check the platform/i
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("stamps POSSIBLE_LIVE_WRITE when a write-started job returns to Approved", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
      scheduledRow({ jobStatus: "PENDING", adapterWriteStarted: true })
    );
    prismaMock.job.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scheduledPost.delete.mockResolvedValue({ id: "sched_1" });
    prismaMock.draft.update.mockResolvedValue({ id: "draft_1" });

    await returnScheduleToApproved("sched_1", true);

    expect(prismaMock.draft.update).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: {
        status: "APPROVED",
        reviewNotes: expect.stringContaining(POSSIBLE_LIVE_WRITE_MARKER),
      },
    });
    expect(prismaMock.job.updateMany).toHaveBeenCalledWith({
      where: { id: "job_1", status: "PENDING" },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringMatching(/may already be live/i),
      }),
    });
    const jobError = prismaMock.job.updateMany.mock.calls[0][0].data
      .errorMessage as string;
    expect(jobError).not.toMatch(/Nothing was published/i);
  });

  it("Copy keeps POSSIBLE_LIVE_WRITE so the new draft cannot skip the platform check", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      ...approvedDraft(`${POSSIBLE_LIVE_WRITE_MARKER} check Facebook first`),
      bandId: "band_1",
      campaignId: null,
      platform: "FACEBOOK",
      toneVariant: "AUTHENTIC",
      contentLength: "MEDIUM",
      caption: "Thursday at The Hive.",
      hashtags: ["#stalemate"],
      mediaUrls: [],
      ctaText: null,
      altText: null,
      imagePrompt: null,
      fanReplies: [],
      brandFitScore: 80,
      confidenceNotes: null,
      riskFlags: [],
    });
    prismaMock.draft.create.mockResolvedValue({ id: "draft_2" });
    prismaMock.draftVersion.create.mockResolvedValue({ id: "ver_1" });

    await duplicateDraft("draft_1");

    expect(prismaMock.draft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "IN_REVIEW",
        caption: "Thursday at The Hive.",
        reviewNotes: expect.stringContaining(POSSIBLE_LIVE_WRITE_MARKER),
      }),
    });
    const notes = prismaMock.draft.create.mock.calls[0][0].data.reviewNotes as string;
    expect(notes).toMatch(/Copy is not publish/);
  });

  it("Copy of a clean approved draft does not invent POSSIBLE_LIVE_WRITE", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      ...approvedDraft(null),
      bandId: "band_1",
      campaignId: null,
      platform: "FACEBOOK",
      toneVariant: "AUTHENTIC",
      contentLength: "MEDIUM",
      caption: "Thursday at The Hive.",
      hashtags: [],
      mediaUrls: [],
      ctaText: null,
      altText: null,
      imagePrompt: null,
      fanReplies: [],
      brandFitScore: 80,
      confidenceNotes: null,
      riskFlags: [],
    });
    prismaMock.draft.create.mockResolvedValue({ id: "draft_2" });
    prismaMock.draftVersion.create.mockResolvedValue({ id: "ver_1" });

    await duplicateDraft("draft_1");

    expect(prismaMock.draft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "IN_REVIEW",
        reviewNotes: undefined,
      }),
    });
  });

  it("refuses Copy of a SCHEDULED draft so a second live path cannot skip the queue", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      ...approvedDraft(null),
      status: "SCHEDULED",
    });

    await expect(duplicateDraft("draft_1")).rejects.toThrow(/scheduled or published/i);
    expect(prismaMock.draft.create).not.toHaveBeenCalled();
  });

  it("Edit of an approved draft returns it to review and keeps POSSIBLE_LIVE_WRITE", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      id: "draft_1",
      status: "APPROVED",
      bandId: "band_1",
      currentVersion: 1,
      hashtags: [],
      ctaText: null,
      reviewNotes: `${POSSIBLE_LIVE_WRITE_MARKER} check Facebook first`,
      caption: "old caption",
      band: { name: "Stalemate", voiceProfile: { emojiTolerance: 2 } },
    });
    prismaMock.band.findMany.mockResolvedValue([]);
    prismaMock.draftVersion.create.mockResolvedValue({ id: "ver_2" });
    prismaMock.draft.update.mockResolvedValue({ id: "draft_1", status: "IN_REVIEW" });

    await updateDraftCaption("draft_1", "Thursday at The Hive.");

    expect(prismaMock.draft.update).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "IN_REVIEW",
        caption: "Thursday at The Hive.",
      }),
    });
    expect(prismaMock.draft.update.mock.calls[0][0].data.status).not.toBe(
      "APPROVED"
    );
    expect(prismaMock.draft.update.mock.calls[0][0].data.status).not.toBe(
      "PUBLISHED"
    );
    expect(prismaMock.draft.update.mock.calls[0][0].data.reviewNotes).toBeUndefined();
  });

  it("refuses Copy of a PUBLISHED draft", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      ...approvedDraft(null),
      status: "PUBLISHED",
    });

    await expect(duplicateDraft("draft_1")).rejects.toThrow(/scheduled or published/i);
    expect(prismaMock.draft.create).not.toHaveBeenCalled();
  });
});
