/**
 * Caption edit is new creative. These action tests prove a stale card
 * cannot overwrite a newer snapshot, and that an approved edit returns
 * to Needs Review with reviewedAt cleared. This does not publish.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  draftVersion: {
    create: jest.fn(),
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

import { updateDraftCaption } from "@/app/(app)/review-queue/actions";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T11:00:00.000Z");

function currentDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    status: "APPROVED",
    bandId: "band_1",
    currentVersion: 1,
    caption: "Thursday at The Hive.",
    hashtags: ["#stalemate"],
    mediaUrls: [],
    riskLevel: "LOW",
    riskFlags: [],
    ctaText: null,
    reviewNotes: null,
    updatedAt: REVIEWED_AT,
    band: { name: "Stalemate", voiceProfile: { emojiTolerance: 2 } },
    ...overrides,
  };
}

describe("caption review fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
    );
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.draftVersion.create.mockResolvedValue({ id: "ver_2" });
    prismaMock.band.findMany.mockResolvedValue([]);
  });

  it("returns an approved edit to Needs Review and clears the old review stamp", async () => {
    const original = currentDraft();
    const updated = { ...original, status: "IN_REVIEW", reviewedAt: null };
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await expect(
      updateDraftCaption(
        DRAFT_ID,
        "Thursday at The Hive — rewritten.",
        reviewSnapshotReceipt(original)
      )
    ).resolves.toEqual(updated);

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "APPROVED",
        updatedAt: REVIEWED_AT,
      },
      data: expect.objectContaining({
        caption: "Thursday at The Hive — rewritten.",
        status: "IN_REVIEW",
        reviewedAt: null,
        currentVersion: 2,
      }),
    });
    expect(prismaMock.draftVersion.create).toHaveBeenCalled();
  });

  it("refuses a stale card after unseen caption or media changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({
        caption: "Newer caption Jeff has not seen.",
        updatedAt: new Date("2026-09-03T11:05:00.000Z"),
      })
    );

    await expect(
      updateDraftCaption(
        DRAFT_ID,
        "Stale edit from the old card.",
        reviewSnapshotReceipt(currentDraft())
      )
    ).rejects.toThrow(/changed since this card loaded/i);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("loses safely when the draft changes between the read and caption write", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(currentDraft());
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateDraftCaption(
        DRAFT_ID,
        "Thursday at The Hive — rewritten.",
        reviewSnapshotReceipt(currentDraft())
      )
    ).rejects.toThrow(/changed while that decision was being saved/i);

    expect(prismaMock.draftVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a timestamp-only leftover receipt", async () => {
    await expect(
      updateDraftCaption(
        DRAFT_ID,
        "Thursday at The Hive — rewritten.",
        REVIEWED_AT.toISOString() as never
      )
    ).rejects.toThrow(/needs the current card/i);

    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
