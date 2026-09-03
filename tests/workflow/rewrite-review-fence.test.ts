/**
 * Rewrite creates new guarded creative. A stale card cannot overwrite a
 * newer snapshot, and an approved rewrite returns to Needs Review with
 * reviewedAt cleared. This does not publish.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
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

const rewriteContent = jest.fn();
const assessRisk = jest.fn();

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("@/lib/services/llm", () => ({
  getLlmAdapter: () => ({
    name: "mock",
    rewriteContent,
    assessRisk,
  }),
}));

import { rewriteDraftAction } from "@/app/(app)/review-queue/actions";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T11:00:00.000Z");

function currentDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    status: "APPROVED",
    bandId: "band_1",
    currentVersion: 2,
    caption: "Thursday at The Hive.",
    hashtags: ["#stalemate"],
    mediaUrls: [],
    riskLevel: "LOW",
    riskFlags: [],
    ctaText: null,
    updatedAt: REVIEWED_AT,
    platform: "INSTAGRAM",
    band: { name: "Stalemate", voiceProfile: { emojiTolerance: 2 } },
    ...overrides,
  };
}

describe("rewrite review fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
    );
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.draftVersion.create.mockResolvedValue({ id: "ver_3" });
    prismaMock.band.findMany.mockResolvedValue([]);
    rewriteContent.mockResolvedValue("Rewritten caption Jeff must review.");
    assessRisk.mockResolvedValue({
      flags: [],
      brandFitScore: 80,
      confidenceNotes: "ok",
    });
  });

  it("returns an approved rewrite to Needs Review and clears reviewedAt", async () => {
    const original = currentDraft();
    const updated = {
      ...original,
      status: "IN_REVIEW",
      caption: "Rewritten caption Jeff must review.",
      reviewedAt: null,
    };
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await expect(
      rewriteDraftAction({
        draftId: DRAFT_ID,
        directive: "funnier",
        reviewedSnapshot: reviewSnapshotReceipt(original),
      })
    ).resolves.toEqual(updated);

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "APPROVED",
        updatedAt: REVIEWED_AT,
      },
      data: expect.objectContaining({
        caption: "Rewritten caption Jeff must review.",
        status: "IN_REVIEW",
        reviewedAt: null,
        currentVersion: 3,
      }),
    });
  });

  it("refuses a stale rewrite card before calling the LLM", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ caption: "Unseen rewrite already landed." })
    );

    await expect(
      rewriteDraftAction({
        draftId: DRAFT_ID,
        directive: "funnier",
        reviewedSnapshot: reviewSnapshotReceipt(currentDraft()),
      })
    ).rejects.toThrow(/changed since this card loaded/i);

    expect(rewriteContent).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses rewrite without a review snapshot receipt", async () => {
    await expect(
      rewriteDraftAction({
        draftId: DRAFT_ID,
        directive: "funnier",
      } as never)
    ).rejects.toThrow();

    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
