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

import { approveDraft } from "@/app/(app)/review-queue/actions";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T08:00:00.000Z");

function currentDraft(updatedAt = REVIEWED_AT) {
  return {
    id: DRAFT_ID,
    status: "IN_REVIEW",
    riskLevel: "LOW",
    reviewNotes: null,
    updatedAt,
  };
}

describe("approval snapshot fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(currentDraft());
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires a valid timestamp from the review card", async () => {
    await expect(approveDraft(DRAFT_ID, "not-a-timestamp")).rejects.toThrow(
      /needs the current review card/i
    );

    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an old card after caption, media, risk, notes, or status changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft(new Date("2026-09-03T08:01:00.000Z"))
    );

    await expect(
      approveDraft(DRAFT_ID, REVIEWED_AT.toISOString())
    ).rejects.toThrow(/changed since this review card loaded/i);

    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("loses safely when the draft changes between the read and approval write", async () => {
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      approveDraft(DRAFT_ID, REVIEWED_AT.toISOString())
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
      approveDraft(DRAFT_ID, REVIEWED_AT.toISOString(), "Reviewed together.")
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
});
