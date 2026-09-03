/**
 * Archive and resume must bind to the desk snapshot. A stale card cannot
 * archive an approved draft waiting to schedule, or resume unseen creative.
 */

const prismaMock = {
  draft: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { archiveDraft, resumeHeldDraft } from "@/app/(app)/review-queue/actions";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

const DRAFT_ID = "clhf5gt0000000test0draftid1";
const REVIEWED_AT = new Date("2026-09-03T08:00:00.000Z");

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
    ...overrides,
  };
}

describe("archive snapshot fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(currentDraft());
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("refuses a leftover draftId without the desk receipt", async () => {
    await expect(archiveDraft(DRAFT_ID, "stale" as never)).rejects.toThrow(
      /needs the current card/i
    );
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a stale card after the snapshot changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ caption: "Unseen rewrite." })
    );

    await expect(
      archiveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).rejects.toThrow(/changed since this card loaded/i);
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to archive a scheduled or published draft", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ status: "SCHEDULED" })
    );

    await expect(
      archiveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft({ status: "SCHEDULED" })))
    ).rejects.toThrow(/cannot be archived from status SCHEDULED/i);
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("archives only the exact still-current snapshot", async () => {
    await expect(
      archiveDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft()))
    ).resolves.toBeUndefined();

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "APPROVED",
        updatedAt: REVIEWED_AT,
      },
      data: { status: "ARCHIVED" },
    });
  });
});

describe("resume snapshot fence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ status: "HELD" })
    );
    prismaMock.draft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("refuses a stale held card after creative changed", async () => {
    prismaMock.draft.findUniqueOrThrow.mockResolvedValue(
      currentDraft({ status: "HELD", caption: "Unseen rewrite." })
    );

    await expect(
      resumeHeldDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft({ status: "HELD" })))
    ).rejects.toThrow(/changed since this card loaded/i);
    expect(prismaMock.draft.updateMany).not.toHaveBeenCalled();
  });

  it("resumes only the exact still-current held snapshot", async () => {
    await expect(
      resumeHeldDraft(DRAFT_ID, reviewSnapshotReceipt(currentDraft({ status: "HELD" })))
    ).resolves.toBeUndefined();

    expect(prismaMock.draft.updateMany).toHaveBeenCalledWith({
      where: {
        id: DRAFT_ID,
        status: "HELD",
        updatedAt: REVIEWED_AT,
      },
      data: { status: "IN_REVIEW" },
    });
  });
});
