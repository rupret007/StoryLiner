/**
 * Approve is a decision about the exact creative Jeff reviewed. These action
 * tests prove that an old browser card or a concurrent edit cannot turn that
 * decision into approval of newer, unseen caption or media.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { approveDraft, denyDraft, holdDraft } from "@/app/(app)/review-queue/actions";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T08:00:00.000Z");

function currentDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    status: "IN_REVIEW",
    riskLevel: "LOW",
    reviewNotes: null,
    caption: "Thursday at The Hive.",
    hashtags: ["#stalemate"],
    mediaUrls: [] as string[],
    riskFlags: [] as string[],
    currentVersion: 1,
    updatedAt: REVIEWED_AT,
    ...overrides,
  };
}

describe("approval snapshot fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(currentDraft());
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires a creative fingerprint from the review card, not a leftover timestamp", async () => {
    await expect(approveDraft(DRAFT_ID, "not-a-timestamp" as never)).rejects.toThrow(
      /needs the current review card/i
    );

    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an old card after caption, media, risk, notes, or status changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ updatedAt: new Date("2026-09-03T08:01:00.000Z") })
    );

    await expect(
      approveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed since this review card loaded/i);

    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the card fingerprint is not the current caption or media", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ caption: "Unseen rewrite Jeff has not looked at." })
    );

    await expect(
      approveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed since this review card loaded/i);

    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("loses safely when the draft changes between the read and approval write", async () => {
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      approveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed while approval was being saved/i);

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "IN_REVIEW",
        updatedAt: REVIEWED_AT,
      },
      data: expect.objectContaining({ status: "APPROVED" }),
    });
  });

  it("approves only the exact still-current review snapshot", async () => {
    await expect(
      approveDraft(
        DRAFT_ID,
        reviewSnapshotReceipt(currentDraft()),
        "Reviewed together."
      )
    ).resolves.toBeUndefined();

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "IN_REVIEW",
        updatedAt: REVIEWED_AT,
      },
      data: {
        status: "APPROVED",
        reviewedAt: expect.any(Date),
        reviewNotes: "Reviewed together.",
      },
    });
  });

  it("Hold and Deny also refuse a stale or unseen snapshot", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ caption: "Unseen rewrite." })
    );

    await expect(
      holdDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed since this card loaded/i);
    await expect(
      denyDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed since this card loaded/i);

    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });
});
