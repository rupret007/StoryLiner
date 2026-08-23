/**
 * Worker handler fail-closed tests. Prisma and adapters are mocked so CI
 * never hits a live network or a real database. A refused or draft-only
 * result must never create a PublishedPost.
 */

const prismaMock = {
  scheduledPost: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  publishLog: {
    create: jest.fn(),
    update: jest.fn(),
  },
  publishedPost: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  draft: {
    update: jest.fn(),
  },
  job: {
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const getSocialAdapter = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("@/lib/adapters/social", () => ({
  getSocialAdapter: (...args: unknown[]) => getSocialAdapter(...args),
}));

import type { Job } from "@prisma/client";
import { handlePublishPost } from "@/lib/jobs/handlers/publish-post";

function job(): Job {
  return {
    id: "job_1",
    type: "PUBLISH_POST",
    status: "RUNNING",
    payload: { scheduledPostId: "sched_1" },
    runAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function scheduledRow(overrides: {
  platform?: "FACEBOOK" | "INSTAGRAM" | "YOUTUBE" | "TWITTER" | "TIKTOK" | "BLUESKY" | "TWITCH";
  status?: "SCHEDULED" | "PUBLISHED" | "FAILED";
  mediaUrls?: string[];
  isConnected?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
  caption?: string;
} = {}) {
  return {
    id: "sched_1",
    bandId: "band_1",
    draftId: "draft_1",
    platformAccountId: "acct_1",
    scheduledFor: new Date(),
    status: overrides.status ?? "SCHEDULED",
    jobId: "job_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    draft: {
      id: "draft_1",
      bandId: "band_1",
      campaignId: null,
      platform: overrides.platform ?? "FACEBOOK",
      status: "SCHEDULED",
      toneVariant: "AUTHENTIC",
      contentLength: "SHORT",
      caption: overrides.caption ?? "Playing tonight.",
      hashtags: [],
      mediaUrls: overrides.mediaUrls ?? [],
      ctaText: null,
      altText: null,
      imagePrompt: null,
      fanReplies: [],
      brandFitScore: 90,
      confidenceNotes: null,
      riskLevel: "LOW",
      riskFlags: [],
      reviewedAt: null,
      reviewNotes: null,
      rejectedAt: null,
      rejectedReason: null,
      currentVersion: 1,
      generationRunId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    platformAccount: {
      id: "acct_1",
      bandId: "band_1",
      platform: overrides.platform ?? "FACEBOOK",
      handle: "demo",
      profileUrl: null,
      isConnected: overrides.isConnected ?? true,
      isActive: overrides.isActive ?? true,
      metadata: overrides.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    band: {
      id: "band_1",
      name: "Stalemate",
    },
    publishedPost: null,
  };
}

describe("handlePublishPost fail-closed", () => {
  const originalAdapter = process.env.SOCIAL_ADAPTER;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SOCIAL_ADAPTER = "mock";
    prismaMock.publishLog.create.mockResolvedValue({ id: "log_1" });
    prismaMock.publishLog.update.mockResolvedValue({ id: "log_1" });
    prismaMock.publishedPost.create.mockResolvedValue({ id: "pub_1" });
    prismaMock.publishedPost.findUnique.mockResolvedValue(null);
    prismaMock.scheduledPost.update.mockResolvedValue({ id: "sched_1" });
    prismaMock.draft.update.mockResolvedValue({ id: "draft_1" });
    prismaMock.job.update.mockResolvedValue({ id: "job_1" });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
  });

  afterEach(() => {
    process.env.SOCIAL_ADAPTER = originalAdapter;
  });

  it("reconciles an already-published row without calling the adapter", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue({
      ...scheduledRow({ status: "PUBLISHED" }),
      publishedPost: { id: "pub_existing" },
    });

    await expect(handlePublishPost(job())).resolves.toBe("already-published");

    expect(getSocialAdapter).not.toHaveBeenCalled();
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
  });

  it("throws when the scheduled row is not SCHEDULED and nothing was published", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
      scheduledRow({ status: "FAILED" })
    );

    await expect(handlePublishPost(job())).rejects.toThrow(/not SCHEDULED/i);
    expect(getSocialAdapter).not.toHaveBeenCalled();
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
  });

  it("refuses a retry after the adapter write already started", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(scheduledRow());

    const retryJob = job();
    retryJob.payload = { scheduledPostId: "sched_1", adapterWriteStarted: true };

    await expect(handlePublishPost(retryJob)).rejects.toThrow(/will not double-publish/i);
    expect(getSocialAdapter).not.toHaveBeenCalled();
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
  });

  it.each(["TWITTER", "TIKTOK", "BLUESKY"] as const)(
    "refuses real-mode %s before any adapter write",
    async (platform) => {
      process.env.SOCIAL_ADAPTER = "real";
      prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
        scheduledRow({
          platform,
          isConnected: true,
          isActive: true,
          mediaUrls: ["https://cdn.example.com/show.jpg"],
        })
      );

      await expect(handlePublishPost(job())).rejects.toThrow(/YouTube only/i);

      expect(getSocialAdapter).not.toHaveBeenCalled();
      expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
      expect(prismaMock.draft.update).not.toHaveBeenCalled();
    }
  );

  it("refuses real Instagram without https media and does not mark published", async () => {
    process.env.SOCIAL_ADAPTER = "real";
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(
      scheduledRow({
        platform: "INSTAGRAM",
        isConnected: true,
        mediaUrls: [],
      })
    );

    await expect(handlePublishPost(job())).rejects.toThrow(/https/i);
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
  });

  it("fails closed on draft-only adapter results", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(scheduledRow());
    getSocialAdapter.mockResolvedValue({
      adapterName: "real-fallback-draft-only-twitter",
      getDegradationWarning: () => "draft only",
      publish: jest.fn().mockResolvedValue({
        success: true,
        isDraftOnly: true,
        durationMs: 5,
        errorMessage: "Draft only",
      }),
    });

    await expect(handlePublishPost(job())).rejects.toThrow(/draft-only/i);

    expect(prismaMock.publishLog.create).toHaveBeenCalled();
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
    expect(prismaMock.draft.update).not.toHaveBeenCalled();
    expect(prismaMock.scheduledPost.update).not.toHaveBeenCalled();
  });

  it("fails closed when the adapter reports success=false", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(scheduledRow());
    getSocialAdapter.mockResolvedValue({
      adapterName: "real-facebook",
      getDegradationWarning: () => null,
      publish: jest.fn().mockResolvedValue({
        success: false,
        isDraftOnly: false,
        durationMs: 8,
        errorMessage: "Graph API rejected the write",
      }),
    });

    await expect(handlePublishPost(job())).rejects.toThrow(/Graph API/i);
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
    expect(prismaMock.job.update).toHaveBeenCalled();
  });

  it("fails closed when the adapter reports success without an external post id", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(scheduledRow());
    getSocialAdapter.mockResolvedValue({
      adapterName: "real-facebook",
      getDegradationWarning: () => null,
      publish: jest.fn().mockResolvedValue({
        success: true,
        isDraftOnly: false,
        durationMs: 8,
        externalPostId: "",
      }),
    });

    await expect(handlePublishPost(job())).rejects.toThrow(/external post id/i);
    expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
  });

  it("creates a PublishedPost only after a successful non-draft write", async () => {
    prismaMock.scheduledPost.findUniqueOrThrow.mockResolvedValue(scheduledRow());
    getSocialAdapter.mockResolvedValue({
      adapterName: "mock-facebook",
      getDegradationWarning: () => null,
      publish: jest.fn().mockResolvedValue({
        success: true,
        isDraftOnly: false,
        externalPostId: "ext_1",
        externalPostUrl: "https://mock-facebook.example.com/posts/ext_1",
        responseCode: 200,
        durationMs: 12,
      }),
    });

    await expect(handlePublishPost(job())).resolves.toBe("published");

    expect(prismaMock.publishedPost.create).toHaveBeenCalled();
    expect(prismaMock.draft.update).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { status: "PUBLISHED" },
    });
    expect(prismaMock.scheduledPost.update).toHaveBeenCalledWith({
      where: { id: "sched_1" },
      data: { status: "PUBLISHED" },
    });
  });
});
