/**
 * Execute the real media action against fixture collaborators. These prove
 * exact-input/receipt boundaries, not database rollback or a live publish.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
  draftVersion: { create: jest.fn() },
  scheduledPost: { create: jest.fn(), update: jest.fn() },
  job: { create: jest.fn(), update: jest.fn() },
  publishedPost: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { revalidatePath } from "next/cache";
import { attachDraftMedia } from "@/app/(app)/review-queue/actions";
import { POSSIBLE_LIVE_WRITE_MARKER } from "@/lib/services/publish/safety";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const UPDATED_AT = new Date("2026-09-05T05:00:00.000Z");
const SAVED_AT = new Date("2026-09-05T05:01:00.000Z");
const URLS = [1, 2, 3, 4, 5].map((number) => `https://cdn.example.com/show-${number}.jpg`);

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    bandId: "fixture-band",
    status: "APPROVED",
    caption: "Fixture show caption.",
    hashtags: ["#fixture"],
    mediaUrls: [...URLS],
    riskLevel: "LOW",
    riskFlags: [] as string[],
    currentVersion: 2,
    updatedAt: UPDATED_AT,
    reviewedAt: UPDATED_AT,
    reviewNotes: `${POSSIBLE_LIVE_WRITE_MARKER} Fixture platform check required.`,
    ...overrides,
  };
}

function givenSavedMedia(mediaUrls: string[]) {
  const original = draft();
  const saved = draft({
    status: "IN_REVIEW",
    reviewedAt: null,
    mediaUrls,
    updatedAt: SAVED_AT,
  });
  prismaMock.draft.findUniqueOrThrow
    .mockResolvedValueOnce(original)
    .mockResolvedValueOnce(saved);
  return { original, saved };
}

beforeEach(() => {
  jest.resetAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)
  );
  prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  expect(prismaMock.draftVersion.create).not.toHaveBeenCalled();
  expect(prismaMock.scheduledPost.create).not.toHaveBeenCalled();
  expect(prismaMock.scheduledPost.update).not.toHaveBeenCalled();
  expect(prismaMock.job.create).not.toHaveBeenCalled();
  expect(prismaMock.job.update).not.toHaveBeenCalled();
  expect(prismaMock.publishedPost.create).not.toHaveBeenCalled();
});

describe("review media edit integrity", () => {
  it("preserves all five URLs and their order when replacing the first image", async () => {
    const replacement = ["https://cdn.example.com/replacement.jpg", ...URLS.slice(1)];
    const { original, saved } = givenSavedMedia(replacement);

    const receipt = await attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: replacement,
      reviewedSnapshot: reviewSnapshotReceipt(original),
    });

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT_ID, status: "APPROVED", updatedAt: UPDATED_AT },
      data: { mediaUrls: replacement, status: "IN_REVIEW", reviewedAt: null },
    });
    expect(receipt).toEqual(saved);
    expect(receipt.mediaUrls).toEqual(replacement);
    expect(receipt.updatedAt).toEqual(SAVED_AT);
    expect(receipt.reviewNotes).toContain(POSSIBLE_LIVE_WRITE_MARKER);
    expect(prismaMock.draft.findUniqueOrThrow).toHaveBeenNthCalledWith(2, {
      where: { id: DRAFT_ID },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/review-queue");
  });

  it("permits trimming and exact deduplication without reordering remaining URLs", async () => {
    const expected = [URLS[1], URLS[0]];
    const { original, saved } = givenSavedMedia(expected);
    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [`  ${URLS[1]}  `, URLS[0], URLS[1], "  "],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    })).resolves.toEqual(saved);
    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { mediaUrls: expected, status: "IN_REVIEW", reviewedAt: null },
    }));
  });

  it.each([
    "http://cdn.example.com/unsafe.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,fixture",
    "https://fixture-user:fixture-password@cdn.example.com/private.jpg",
    "not a URL",
  ])("rejects the entire mixed list when one nonblank entry is invalid: %s", async (invalid) => {
    const original = draft();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(original);

    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [URLS[0], invalid, URLS[2]],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    })).rejects.toThrow(/https/i);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not silently truncate a sixth media entry", async () => {
    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [...URLS, "https://cdn.example.com/sixth.jpg"],
      reviewedSnapshot: reviewSnapshotReceipt(draft()),
    })).rejects.toThrow();
    expect(prismaMock.draft.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("can explicitly clear the list without changing caption or the live-write marker", async () => {
    const { original, saved } = givenSavedMedia([]);
    const result = await attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    });
    expect(result).toEqual(saved);
    const { data } = prismaMock.draft.updateMany.mock.calls[0][0];
    expect(data).toEqual({ mediaUrls: [], status: "IN_REVIEW", reviewedAt: null });
    expect(data).not.toHaveProperty("reviewNotes");
    expect(data).not.toHaveProperty("caption");
    expect(data).not.toHaveProperty("riskFlags");
  });

  it("rejects an editor receipt when another media URL changed on the saved draft", async () => {
    const original = draft();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(draft({
      mediaUrls: [URLS[0], "https://cdn.example.com/other-editor.jpg"],
    }));
    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: ["https://cdn.example.com/local-edit.jpg", ...URLS.slice(1)],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    })).rejects.toThrow(/changed since this card loaded/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("does not return a saved receipt after the compare-and-set loses a race", async () => {
    const original = draft();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(original);
    prismaMock.draft.updateMany.mockResolvedValue({ count: 0 });
    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [URLS[0]],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    })).rejects.toThrow(/changed while media was being saved/i);
    expect(prismaMock.draft.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("propagates a failed transaction receipt read rather than returning a guessed success", async () => {
    const original = draft();
    prismaMock.draft.findUniqueOrThrow
      .mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new Error("Fixture receipt read unavailable"));
    await expect(attachDraftMedia({
      draftId: DRAFT_ID,
      mediaUrls: [URLS[0]],
      reviewedSnapshot: reviewSnapshotReceipt(original),
    })).rejects.toThrow("Fixture receipt read unavailable");
    expect(prismaMock.draft.updateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
    // A mocked transaction cannot prove rollback; the only asserted UI-facing
    // contract is rejection, not a fabricated saved-row receipt.
  });

  it.each(["DRAFT", "REJECTED", "ARCHIVED", "SCHEDULED", "PUBLISHED"])(
    "refuses editing media from immutable status %s before any write",
    async (status) => {
      const original = draft({ status });
      prismaMock.draft.findUniqueOrThrow.mockResolvedValue(original);
      await expect(attachDraftMedia({
        draftId: DRAFT_ID,
        mediaUrls: [URLS[0]],
        reviewedSnapshot: reviewSnapshotReceipt(original),
      })).rejects.toThrow(/Media cannot be changed/i);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
    }
  );
});
