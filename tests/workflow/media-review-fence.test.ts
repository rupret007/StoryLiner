/**
 * Media is part of the reviewed publish payload. These mocked action tests
 * prove that attach / replace / clear cannot preserve approval or race a
 * concurrent Schedule into an unreviewed live path.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { attachDraftMedia } from "@/app/(app)/review-queue/actions";
import { POSSIBLE_LIVE_WRITE_MARKER } from "@/lib/services/publish/safety";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T08:00:00.000Z");

function mediaDraft(status: string, extras: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    status,
    reviewNotes: `${POSSIBLE_LIVE_WRITE_MARKER} check Facebook first`,
    caption: "Thursday at The Hive.",
    hashtags: ["#stalemate"],
    mediaUrls: [] as string[],
    riskLevel: "LOW",
    riskFlags: [] as string[],
    currentVersion: 1,
    updatedAt: REVIEWED_AT,
    ...extras,
  };
}

describe("media review fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
    );
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  async function saveFrom(status: "IN_REVIEW" | "HELD" | "APPROVED") {
    const original = mediaDraft(status);
    const updated = {
      ...original,
      status: "IN_REVIEW",
      mediaUrls: ["https://cdn.example.com/reviewed-show.jpg"],
      reviewedAt: null,
    };
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await expect(
      attachDraftMedia({
        draftId: DRAFT_ID,
        mediaUrls: ["https://cdn.example.com/reviewed-show.jpg"],
        reviewedSnapshot: reviewSnapshotReceipt(original),
      })
    ).resolves.toEqual(updated);

    return prismaMock.draft.updateMany.mock.calls[0][0];
  }

  it.each(["APPROVED", "HELD"] as const)(
    "returns %s media to Needs Review and preserves the live-write receipt",
    async (status) => {
      const mutation = await saveFrom(status);
      expect(mutation).toEqual({
        where: { id: DRAFT_ID, status, updatedAt: REVIEWED_AT },
        data: {
          mediaUrls: ["https://cdn.example.com/reviewed-show.jpg"],
          status: "IN_REVIEW",
          reviewedAt: null,
        },
      });
      expect(mutation.data).not.toHaveProperty("reviewNotes");
    }
  );

  it("keeps IN_REVIEW media in review and can clear it", async () => {
    const original = mediaDraft("IN_REVIEW", { reviewNotes: null });
    const updated = { ...original, mediaUrls: [], reviewedAt: null };
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    });

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, status: "IN_REVIEW", updatedAt: REVIEWED_AT },
      data: { mediaUrls: [], status: "IN_REVIEW", reviewedAt: null },
    });
  });

  it.each(["SCHEDULED", "PUBLISHED"])(
    "refuses media mutation from %s before opening a transaction",
    async (status) => {
      const original = mediaDraft(status);
      prismaMock.draft.findUniqueOrThrow.mockResolvedValue(original);

      await expect(
        attachDraftMedia({
          draftId: DRAFT_ID,
          mediaUrls: ["https://cdn.example.com/show.jpg"],
          reviewedSnapshot: reviewSnapshotReceipt(original),
        })
      ).rejects.toThrow(new RegExp(`Media cannot be changed from status ${status}`));

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
    }
  );

  it("loses safely when Schedule changes the status first", async () => {
    const original = mediaDraft("APPROVED", { reviewNotes: null });
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(original);
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      attachDraftMedia({
        draftId: DRAFT_ID,
        mediaUrls: ["https://cdn.example.com/unreviewed.jpg"],
        reviewedSnapshot: reviewSnapshotReceipt(original),
      })
    ).rejects.toThrow(/Draft changed while media was being saved/i);

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, status: "APPROVED", updatedAt: REVIEWED_AT },
      data: {
        mediaUrls: ["https://cdn.example.com/unreviewed.jpg"],
        status: "IN_REVIEW",
        reviewedAt: null,
      },
    });
    expect(prismaMock.draft.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("refuses media save from a card that does not match the current caption", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      mediaDraft("APPROVED", { caption: "Unseen rewrite." })
    );

    await expect(
      attachDraftMedia({
        draftId: DRAFT_ID,
        mediaUrls: ["https://cdn.example.com/unreviewed.jpg"],
        reviewedSnapshot: reviewSnapshotReceipt(mediaDraft("APPROVED")),
      })
    ).rejects.toThrow(/changed since this card loaded/i);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
