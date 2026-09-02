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

const DRAFT_ID = "clhf5gt0000000test0draftid1";

describe("media review fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
    );
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  async function saveFrom(status: "IN_REVIEW" | "HELD" | "APPROVED") {
    const original = {
      id: DRAFT_ID,
      status,
      reviewNotes: `${POSSIBLE_LIVE_WRITE_MARKER} check Facebook first`,
    };
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
      })
    ).resolves.toEqual(updated);

    return prismaMock.draft.updateMany.mock.calls[0][0];
  }

  it.each(["APPROVED", "HELD"] as const)(
    "returns %s media to Needs Review and preserves the live-write receipt",
    async (status) => {
      const mutation = await saveFrom(status);
      expect(mutation).toEqual({
        where: { id: DRAFT_ID, status },
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
    const original = { id: DRAFT_ID, status: "IN_REVIEW", reviewNotes: null };
    const updated = { ...original, mediaUrls: [], reviewedAt: null };
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await attachDraftMedia({ draftId: DRAFT_ID, mediaUrls: [] });

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, status: "IN_REVIEW" },
      data: { mediaUrls: [], status: "IN_REVIEW", reviewedAt: null },
    });
  });

  it.each(["SCHEDULED", "PUBLISHED"])(
    "refuses media mutation from %s before opening a transaction",
    async (status) => {
      prismaMock.draft.findUniqueOrThrow.mockResolvedValue({ id: DRAFT_ID, status });

      await expect(
        attachDraftMedia({
          draftId: DRAFT_ID,
          mediaUrls: ["https://cdn.example.com/show.jpg"],
        })
      ).rejects.toThrow(new RegExp(`Media cannot be changed from status ${status}`));

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
    }
  );

  it("loses safely when Schedule changes the status first", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue({
      id: DRAFT_ID,
      status: "APPROVED",
      reviewNotes: null,
    });
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      attachDraftMedia({
        draftId: DRAFT_ID,
        mediaUrls: ["https://cdn.example.com/unreviewed.jpg"],
      })
    ).rejects.toThrow(/Draft changed while media was being saved/i);

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, status: "APPROVED" },
      data: {
        mediaUrls: ["https://cdn.example.com/unreviewed.jpg"],
        status: "IN_REVIEW",
        reviewedAt: null,
      },
    });
    expect(prismaMock.draft.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });
});
