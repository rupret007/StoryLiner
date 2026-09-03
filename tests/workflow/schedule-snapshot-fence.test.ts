/**
 * Schedule is the next yes after Approve. It must bind to the exact
 * approved caption / media / guard snapshot on the desk. A stale card
 * cannot queue unseen creative. Nothing is published.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
  scheduledPost: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  platformAccount: {
    findFirst: jest.fn(),
  },
  job: {
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { scheduleApprovedDraft } from "@/app/(app)/review-queue/actions";
import { scheduleDraftSchema } from "@/lib/schemas/content";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const ACCOUNT_ID = "clhf5gt0000000test0accountd";
const REVIEWED_AT = new Date("2026-09-03T08:00:00.000Z");
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function currentDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    status: "APPROVED",
    riskLevel: "LOW",
    reviewNotes: null,
    caption: "Thursday at The Hive.",
    hashtags: ["#stalemate"],
    mediaUrls: [] as string[],
    riskFlags: [] as string[],
    currentVersion: 1,
    updatedAt: REVIEWED_AT,
    platform: "FACEBOOK",
    bandId: "clhf5gt0000000test0bandid01",
    brandFitScore: 80,
    band: { name: "Stalemate" },
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    draftId: DRAFT_ID,
    platformAccountId: ACCOUNT_ID,
    scheduledFor: FUTURE,
    reviewedSnapshot: reviewSnapshotReceipt(currentDraft()),
    ...overrides,
  };
}

describe("schedule snapshot fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(currentDraft());
    prismaMock.scheduledPost.findUnique.mockResolvedValue(null);
    prismaMock.platformAccount.findFirst.mockResolvedValue({
      id: ACCOUNT_ID,
      isConnected: false,
      isActive: true,
      metadata: {},
    });
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });
    prismaMock.scheduledPost.create.mockResolvedValue({ id: "post-1" });
    prismaMock.job.update.mockResolvedValue({ id: "job-1" });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
  });

  it("requires the approved snapshot receipt — leftover draftId is not enough", () => {
    const missing = scheduleDraftSchema.safeParse({
      draftId: DRAFT_ID,
      platformAccountId: ACCOUNT_ID,
      scheduledFor: FUTURE,
    });
    expect(missing.success).toBe(false);

    const valid = scheduleDraftSchema.safeParse(input());
    expect(valid.success).toBe(true);
  });

  it("refuses a leftover timestamp in place of the desk receipt", async () => {
    await expect(
      scheduleApprovedDraft({
        ...input(),
        reviewedSnapshot: "2026-09-03T08:00:00.000Z" as never,
      })
    ).rejects.toThrow(/needs the current approved snapshot/i);

    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an old approved card after caption or media changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ caption: "Unseen rewrite Jeff has not looked at." })
    );

    await expect(scheduleApprovedDraft(input())).rejects.toThrow(
      /changed since this card loaded/i
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("loses safely when the approved snapshot changes mid-schedule", async () => {
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(scheduleApprovedDraft(input())).rejects.toThrow(
      /changed while scheduling was being saved/i
    );

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "APPROVED",
        updatedAt: REVIEWED_AT,
      },
      data: expect.objectContaining({ status: "SCHEDULED" }),
    });
  });

  it("schedules only the exact still-current approved snapshot", async () => {
    await expect(scheduleApprovedDraft(input())).resolves.toEqual({ id: "post-1" });

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "APPROVED",
        updatedAt: REVIEWED_AT,
      },
      data: expect.objectContaining({ status: "SCHEDULED" }),
    });
  });
});
