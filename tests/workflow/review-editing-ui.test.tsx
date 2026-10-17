/** @jest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, prefetch: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/app/(app)/review-queue/actions", () => ({
  approveDraft: jest.fn(),
  denyDraft: jest.fn(),
  holdDraft: jest.fn(),
  resumeHeldDraft: jest.fn(),
  archiveDraft: jest.fn(),
  duplicateDraft: jest.fn(),
  rewriteDraftAction: jest.fn(),
  updateDraftCaption: jest.fn(),
  attachDraftMedia: jest.fn(),
  scheduleApprovedDraft: jest.fn(),
}));

import { ReviewQueueClient } from "@/app/(app)/review-queue/client";
import {
  approveDraft,
  attachDraftMedia,
  holdDraft,
  rewriteDraftAction,
  scheduleApprovedDraft,
  updateDraftCaption,
} from "@/app/(app)/review-queue/actions";
import { reviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";

type ReviewDraft = ComponentProps<typeof ReviewQueueClient>["drafts"][number];
const mockRefresh = jest.fn();
const captionAction = jest.mocked(updateDraftCaption);
const mediaAction = jest.mocked(attachDraftMedia);
const DRAFT_A = "clhf5gt0000000test0draftid1";
const DRAFT_B = "clhf5gt0000000test0draftid2";
const INITIAL_TIME = new Date("2026-09-05T00:00:00.000Z");

function draft(
  id = DRAFT_A,
  overrides: Partial<ReviewDraft> = {},
): ReviewDraft {
  const bandId = id === DRAFT_A ? "fixture-rad-dad" : "fixture-stalemate";
  return {
    id,
    bandId,
    campaignId: null,
    generationRunId: null,
    platform: "FACEBOOK",
    status: "IN_REVIEW",
    toneVariant: "AUTHENTIC",
    contentLength: "MEDIUM",
    caption: id === DRAFT_A ? "Rad Dad saved caption." : "Stalemate saved caption.",
    hashtags: [],
    mediaUrls: [`https://example.test/${bandId}.jpg`],
    ctaText: null,
    altText: null,
    imagePrompt: null,
    fanReplies: [],
    brandFitScore: null,
    confidenceNotes: null,
    riskLevel: "LOW",
    riskFlags: [],
    reviewedAt: null,
    reviewNotes: null,
    rejectedAt: null,
    rejectedReason: null,
    currentVersion: 1,
    createdAt: INITIAL_TIME,
    updatedAt: INITIAL_TIME,
    band: {
      id: bandId,
      userId: "fixture-local-operator",
      name: id === DRAFT_A ? "Rad Dad" : "Stalemate",
      slug: bandId,
      description: null,
      genre: null,
      location: null,
      founded: null,
      coverColor: "#335577",
      isActive: true,
      createdAt: INITIAL_TIME,
      updatedAt: INITIAL_TIME,
      voiceProfile: null,
      platformAccounts: [{
        id: `${bandId}-facebook`,
        bandId,
        platform: "FACEBOOK",
        handle: `${bandId}-offline`,
        profileUrl: null,
        isConnected: false,
        isActive: true,
        metadata: null,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME,
      }],
    },
    versions: [],
    campaign: null,
    generationRun: null,
    scheduledPost: null,
    ...overrides,
  };
}

function saved(original: ReviewDraft, changes: Partial<ReviewDraft>): ReviewDraft {
  return {
    ...original,
    status: "IN_REVIEW",
    updatedAt: new Date(original.updatedAt.getTime() + 60_000),
    currentVersion: original.currentVersion + 1,
    ...changes,
  };
}

function deferredSave() {
  let resolve!: (result: ReviewDraft) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReviewDraft>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch;
let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  originalFetch = globalThis.fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  captionAction.mockReset();
  mediaAction.mockReset();
  globalThis.fetch = jest.fn().mockRejectedValue(
    new Error("UI fixtures must not contact a provider or database."),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

async function render(drafts: ReviewDraft[], focusDraftId = drafts[0].id) {
  await act(async () => root.render(
    <ReviewQueueClient drafts={drafts} focusDraftId={focusDraftId} />,
  ));
}

function button(label: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find((node) =>
    node.getAttribute("aria-label") === label || node.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}\n${container.textContent}`);
  return found;
}

function field(label: "Caption" | "Media URL"): HTMLInputElement | HTMLTextAreaElement {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  );
  if (!found) throw new Error(`Missing field: ${label}\n${container.textContent}`);
  return found;
}

async function click(label: string, scope: ParentNode = container) {
  await act(async () => button(label, scope).click());
}

async function type(label: "Caption" | "Media URL", value: string) {
  const input = field(label);
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(field(label).value).toBe(value);
}

async function openEditors() {
  await click("Edit caption");
  await click("Rewrites and details");
}

describe("draft-scoped editing through the real review desk", () => {
  it("never retargets Rad Dad input to Stalemate and restores it when returning", async () => {
    const a = draft();
    const b = draft(DRAFT_B);
    await render([a, b]);
    await openEditors();
    await type("Caption", "Rad Dad local caption.");
    await type("Media URL", "https://example.test/rad-dad-local.jpg");
    await render([a, b], b.id);
    await openEditors();
    expect(field("Caption").value).toBe(b.caption);
    expect(field("Media URL").value).toBe(b.mediaUrls[0]);
    expect(container.textContent).not.toContain("Rad Dad local caption.");

    await render([a, b], a.id);
    if (!container.querySelector('[aria-label="Media URL"]')) {
      await click("Rewrites and details");
    }
    expect(field("Caption").value).toBe("Rad Dad local caption.");
    expect(field("Media URL").value).toBe("https://example.test/rad-dad-local.jpg");
    captionAction.mockResolvedValue(saved(a, { caption: "Rad Dad local caption." }));
    await click("Save caption");
    expect(captionAction).toHaveBeenCalledTimes(1);
    expect(captionAction).toHaveBeenCalledWith(
      a.id, "Rad Dad local caption.", reviewSnapshotReceipt(a),
    );
    expect(mediaAction).not.toHaveBeenCalled();
  });

  it("keeps text and the original receipt after failure, blocking stale retries until explicit review", async () => {
    const a = draft();
    await render([a]);
    await click("Edit caption");
    await type("Caption", "My unsaved caption.");
    captionAction.mockRejectedValueOnce(new Error("Synthetic save response lost"));
    await click("Save caption");
    expect(field("Caption").value).toBe("My unsaved caption.");
    expect(button("Save caption").disabled).toBe(true);
    expect(captionAction).toHaveBeenCalledWith(
      a.id, "My unsaved caption.", reviewSnapshotReceipt(a),
    );
    expect(container.textContent).toMatch(/Save not confirmed/i);

    const latest = saved(a, { caption: "Different saved caption." });
    await render([latest]);
    expect(field("Caption").value).toBe("My unsaved caption.");
    expect(button("Save caption").disabled).toBe(true);
    await click("Save caption");
    expect(captionAction).toHaveBeenCalledTimes(1);
    await click("Refresh saved version");
    expect(mockRefresh).toHaveBeenCalled();
    await render([{ ...latest }]);
    expect(container.textContent).toContain("Your edits");
    expect(container.textContent).toContain("Latest saved version");
    await click("Keep my edits");
    expect(captionAction).toHaveBeenCalledTimes(1);
    captionAction.mockResolvedValueOnce(saved(latest, { caption: "My unsaved caption." }));
    await click("Save caption");
    expect(captionAction).toHaveBeenLastCalledWith(
      a.id, "My unsaved caption.", reviewSnapshotReceipt(latest),
    );
  });

  it("keeps media edits after caption success and uses the returned receipt for a separate media save", async () => {
    const a = draft();
    const captionSaved = saved(a, { caption: "Caption confirmed." });
    await render([a]);
    await openEditors();
    await type("Caption", captionSaved.caption);
    await type("Media URL", "https://example.test/media-unsaved.jpg");
    captionAction.mockResolvedValue(captionSaved);
    await click("Save caption");
    expect(field("Media URL").value).toBe("https://example.test/media-unsaved.jpg");
    expect(mediaAction).not.toHaveBeenCalled();
    mediaAction.mockRejectedValueOnce(new Error("Synthetic media failure"));
    await click("Save media");
    expect(mediaAction).toHaveBeenCalledWith({
      draftId: a.id,
      mediaUrls: ["https://example.test/media-unsaved.jpg"],
      reviewedSnapshot: reviewSnapshotReceipt(captionSaved),
    });
    expect(field("Media URL").value).toBe("https://example.test/media-unsaved.jpg");
    expect(container.textContent).toContain(captionSaved.caption);
    expect(captionAction).toHaveBeenCalledTimes(1);
  });

  it("keeps only fields actually edited when explicitly reviewing a newer saved version", async () => {
    const a = draft();
    await render([a]);
    await openEditors();
    await type("Caption", "Only my caption changed.");
    const latest = saved(a, {
      mediaUrls: ["https://example.test/newer-saved-media.jpg"],
      currentVersion: a.currentVersion,
    });
    await render([latest]);
    await click("Keep my edits");
    expect(field("Caption").value).toBe("Only my caption changed.");
    expect(field("Media URL").value).toBe(latest.mediaUrls[0]);
    expect(button("Save media").disabled).toBe(true);
    expect(mediaAction).not.toHaveBeenCalled();
    expect(captionAction).not.toHaveBeenCalled();
    captionAction.mockResolvedValue(saved(latest, { caption: "Only my caption changed." }));
    await click("Save caption");
    expect(captionAction).toHaveBeenCalledWith(
      a.id, "Only my caption changed.", reviewSnapshotReceipt(latest),
    );
  });

  it("keeps a media-only edit while adopting a newer saved caption on explicit review", async () => {
    const a = draft();
    await render([a]);
    await openEditors();
    await type("Media URL", "https://example.test/only-local-media.jpg");
    const latest = saved(a, { caption: "A newer caption already saved elsewhere." });
    await render([latest]);
    await click("Keep my edits");
    expect(field("Caption").value).toBe(latest.caption);
    expect(field("Media URL").value).toBe("https://example.test/only-local-media.jpg");
    expect(button("Save caption").disabled).toBe(true);
    expect(captionAction).not.toHaveBeenCalled();
    expect(mediaAction).not.toHaveBeenCalled();
    mediaAction.mockResolvedValue(saved(latest, {
      mediaUrls: ["https://example.test/only-local-media.jpg"],
      currentVersion: latest.currentVersion,
    }));
    await click("Save media");
    expect(mediaAction).toHaveBeenCalledWith({
      draftId: a.id,
      mediaUrls: ["https://example.test/only-local-media.jpg"],
      reviewedSnapshot: reviewSnapshotReceipt(latest),
    });
  });

  it("refuses an explicitly refreshed row older than a confirmed save until current saved truth arrives", async () => {
    const a = draft();
    const confirmed = saved(a, { caption: "Caption already confirmed by its receipt." });
    await render([a]);
    await openEditors();
    await type("Caption", confirmed.caption);
    await type("Media URL", "https://example.test/media-still-local.jpg");
    captionAction.mockResolvedValue(confirmed);
    await click("Save caption");
    mediaAction.mockRejectedValueOnce(new Error("Synthetic uncertain media response"));
    await click("Save media");
    await click("Refresh saved version");
    await render([{ ...a }]);
    expect(field("Media URL").value).toBe("https://example.test/media-still-local.jpg");
    expect(button("Save media").disabled).toBe(true);
    expect(button("Refresh saved version").disabled).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).some(
      (node) => node.textContent?.trim() === "Keep my edits",
    )).toBe(false);

    await click("Refresh saved version");
    await render([{ ...confirmed }]);
    await click("Keep my edits");
    expect(field("Media URL").value).toBe("https://example.test/media-still-local.jpg");
    // Keep against an unchanged current base must not retire that very same
    // receipt and permanently block another explicit recovery attempt.
    mediaAction.mockRejectedValueOnce(new Error("Synthetic second uncertain media response"));
    await click("Save media");
    await click("Refresh saved version");
    await render([{ ...confirmed }]);
    await click("Keep my edits");
    expect(field("Media URL").value).toBe("https://example.test/media-still-local.jpg");
    mediaAction.mockResolvedValueOnce(saved(confirmed, {
      mediaUrls: ["https://example.test/media-still-local.jpg"],
      currentVersion: confirmed.currentVersion,
    }));
    await click("Save media");
    expect(mediaAction).toHaveBeenCalledTimes(3);
    expect(mediaAction).toHaveBeenLastCalledWith({
      draftId: a.id,
      mediaUrls: ["https://example.test/media-still-local.jpg"],
      reviewedSnapshot: reviewSnapshotReceipt(confirmed),
    });
    expect(captionAction).toHaveBeenCalledTimes(1);
  });

  it("keeps caption edits after media success without applying them in the media write", async () => {
    const a = draft();
    const mediaSaved = saved(a, {
      mediaUrls: ["https://example.test/media-confirmed.jpg"],
      currentVersion: a.currentVersion,
    });
    await render([a]);
    await openEditors();
    await type("Caption", "Caption still local.");
    await type("Media URL", mediaSaved.mediaUrls[0]);
    mediaAction.mockResolvedValue(mediaSaved);
    await click("Save media");
    expect(field("Caption").value).toBe("Caption still local.");
    expect(captionAction).not.toHaveBeenCalled();
    captionAction.mockResolvedValue(saved(mediaSaved, { caption: "Caption still local." }));
    await click("Save caption");
    expect(captionAction).toHaveBeenCalledWith(
      a.id, "Caption still local.", reviewSnapshotReceipt(mediaSaved),
    );
  });

  it("preserves additional saved media URLs when replacing the visible first URL", async () => {
    const a = draft(DRAFT_A, { mediaUrls: [
      "https://example.test/first.jpg",
      "https://example.test/second.jpg",
      "https://example.test/third.jpg",
    ] });
    await render([a]);
    await click("Rewrites and details");
    await type("Media URL", "https://example.test/replaced-first.jpg");
    const expectedMedia = ["https://example.test/replaced-first.jpg", ...a.mediaUrls.slice(1)];
    mediaAction.mockResolvedValue(saved(a, {
      mediaUrls: expectedMedia, currentVersion: a.currentVersion,
    }));
    await click("Save media");
    expect(mediaAction).toHaveBeenCalledWith({
      draftId: a.id,
      mediaUrls: expectedMedia,
      reviewedSnapshot: reviewSnapshotReceipt(a),
    });
    expect(captionAction).not.toHaveBeenCalled();
  });

  it("blocks approval and rewrites while edits are dirty, and restores them after discard", async () => {
    await render([draft()]);
    await openEditors();
    await type("Caption", "Unreviewed local content.");
    expect(button("Approve").disabled).toBe(true);
    expect(button("Funnier").disabled).toBe(true);
    await click("Approve");
    await click("Funnier");
    expect(approveDraft).not.toHaveBeenCalled();
    expect(rewriteDraftAction).not.toHaveBeenCalled();
    await click("Discard edits");
    expect(button("Approve").disabled).toBe(false);
    expect(button("Funnier").disabled).toBe(false);
  });

  it("blocks the inline schedule while an approved draft has local changes", async () => {
    await render([draft(DRAFT_A, { status: "APPROVED" })]);
    const accountPicker = container.querySelector<HTMLButtonElement>("[role=combobox]");
    expect(accountPicker).not.toBeNull();
    await act(async () => {
      accountPicker!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    const accountOption = document.querySelector<HTMLElement>("[role=option]");
    expect(accountOption).not.toBeNull();
    await act(async () => {
      accountOption!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(button("Schedule").matches(":disabled")).toBe(false);
    await click("Edit caption");
    await type("Caption", "Approval does not cover this edit.");
    const schedule = button("Schedule");
    expect(schedule.matches(":disabled")).toBe(true);
    await click("Schedule");
    expect(scheduleApprovedDraft).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/save|discard/i);
  });

  it("does not let a late save completion change the newly focused band's editor", async () => {
    const a = draft();
    const b = draft(DRAFT_B);
    const pending = deferredSave();
    await render([a, b]);
    await click("Edit caption");
    await type("Caption", "Rad Dad pending save.");
    captionAction.mockReturnValue(pending.promise);
    await click("Save caption");
    await render([a, b], b.id);
    await click("Edit caption");
    await type("Caption", "Stalemate must stay local.");
    await act(async () => pending.resolve(saved(a, { caption: "Rad Dad pending save." })));
    expect(field("Caption").value).toBe("Stalemate must stay local.");
    expect(container.textContent).not.toContain("Rad Dad pending save.");
    expect(captionAction).toHaveBeenCalledTimes(1);
    expect(captionAction).toHaveBeenCalledWith(
      a.id, "Rad Dad pending save.", reviewSnapshotReceipt(a),
    );
  });

  it("latches a save before React rerenders so a double click sends one mutation", async () => {
    const a = draft();
    const pending = deferredSave();
    await render([a]);
    await click("Edit caption");
    await type("Caption", "One save only.");
    captionAction.mockReturnValue(pending.promise);
    const saveButton = button("Save caption");
    await act(async () => { saveButton.click(); saveButton.click(); });
    expect(captionAction).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(saved(a, { caption: "One save only." })));
  });

  it("keeps a timed-out save unconfirmed when its late acknowledgement eventually arrives", async () => {
    const a = draft();
    const pending = deferredSave();
    await render([a]);
    await click("Edit caption");
    await type("Caption", "Do not lose this during a slow response.");
    captionAction.mockReturnValue(pending.promise);
    jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick", "setImmediate"] });
    try {
      await click("Save caption");
      expect(captionAction).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(20_001); });
      expect(container.textContent).toMatch(/Save not confirmed/i);
      expect(field("Caption").value).toBe("Do not lose this during a slow response.");
      expect(button("Refresh saved version").disabled).toBe(false);
      await act(async () => pending.resolve(saved(a, {
        caption: "Do not lose this during a slow response.",
      })));
      expect(container.textContent).toMatch(/Save not confirmed/i);
      expect(field("Caption").value).toBe("Do not lose this during a slow response.");
      expect(button("Save caption").disabled).toBe(true);
      expect(button("Approve").disabled).toBe(true);
      expect(captionAction).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(["caption", "media"] as const)(
    "updates the outer pipeline, chrome and queue counts immediately after a confirmed %s save",
    async (fieldName) => {
      const a = draft(DRAFT_A, { status: "APPROVED", reviewedAt: INITIAL_TIME });
      await render([a]);
      expect(container.querySelector('[aria-current="step"]')?.textContent).toBe("Schedule");
      expect(container.textContent).toContain("Schedule is the next yes.");
      if (fieldName === "caption") {
        await click("Edit caption");
        await type("Caption", "Confirmed caption returns to review.");
        captionAction.mockResolvedValue(saved(a, {
          caption: "Confirmed caption returns to review.", reviewedAt: null,
        }));
        await click("Save caption");
      } else {
        await click("Rewrites and details");
        await type("Media URL", "https://example.test/confirmed-review-media.jpg");
        mediaAction.mockResolvedValue(saved(a, {
          mediaUrls: ["https://example.test/confirmed-review-media.jpg"],
          currentVersion: a.currentVersion, reviewedAt: null,
        }));
        await click("Save media");
      }
      // router.refresh is deliberately a no-op: the original server props are
      // still APPROVED, so these assertions require the confirmed action row.
      expect(mockRefresh).toHaveBeenCalled();
      expect(container.querySelector('[aria-current="step"]')?.textContent).toBe("Review");
      expect(container.textContent).toContain("Review this snapshot. Approve / Hold / Deny never publish.");
      expect(container.textContent).not.toContain("Schedule is the next yes.");
      expect(button("Approve").disabled).toBe(false);
      await act(async () => root.render(<ReviewQueueClient drafts={[a]} />));
      expect(container.textContent).toContain("1 need review");
      expect(container.textContent).toContain("0 approved");
      const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
      expect(activeTab?.textContent).toBe("Needs Review (1)");
      const activePanel = container.querySelector('[role="tabpanel"][data-state="active"]');
      expect(activePanel?.textContent).toContain("Needs Review");
      expect(activePanel?.querySelector('[data-decision="approve"]')).not.toBeNull();
      expect(activePanel?.querySelector('[data-decision="schedule"]')).toBeNull();
    },
  );

  it.each(["wrong draft", "wrong caption"])(
    "keeps a save unconfirmed when the response belongs to the %s",
    async (mismatch) => {
      const a = draft();
      await render([a]);
      await click("Edit caption");
      await type("Caption", "My exact submitted caption.");
      const response = mismatch === "wrong draft"
        ? saved(draft(DRAFT_B), { caption: "My exact submitted caption." })
        : saved(a, { caption: "Not the caption I submitted." });
      captionAction.mockResolvedValue(response);
      await click("Save caption");
      expect(field("Caption").value).toBe("My exact submitted caption.");
      expect(button("Save caption").disabled).toBe(true);
      expect(button("Approve").disabled).toBe(true);
      expect(container.textContent).toMatch(/Save not confirmed/i);
      expect(captionAction).toHaveBeenCalledTimes(1);
    },
  );

  it("does not let an older save receipt replace newer creative received while saving", async () => {
    const a = draft();
    const pending = deferredSave();
    await render([a]);
    await click("Edit caption");
    await type("Caption", "My pending caption.");
    captionAction.mockReturnValue(pending.promise);
    await click("Save caption");
    const response = saved(a, { caption: "My pending caption." });
    const newer = saved(response, { caption: "Newer saved creative must stay visible." });
    await render([newer]);
    await act(async () => pending.resolve(response));
    const comparison = container.querySelector('[data-testid="draft-edit-comparison"]');
    expect(comparison?.textContent).toContain("Newer saved creative must stay visible.");
    expect(comparison?.textContent).toContain("My pending caption.");
    expect(button("Approve").disabled).toBe(true);
    expect(captionAction).toHaveBeenCalledTimes(1);
  });

  it("updates clean editor values after a refreshed saved snapshot", async () => {
    const a = draft();
    await render([a]);
    await openEditors();
    const latest = saved(a, {
      caption: "Fresh saved caption.",
      mediaUrls: ["https://example.test/fresh-saved.jpg"],
    });
    await render([latest]);
    expect(field("Caption").value).toBe(latest.caption);
    expect(field("Media URL").value).toBe(latest.mediaUrls[0]);
    expect(captionAction).not.toHaveBeenCalled();
    expect(mediaAction).not.toHaveBeenCalled();
  });

  it.each(["another band", "newer saved snapshot"])(
    "closes an open confirmation when the desk changes to %s",
    async (change) => {
      const a = draft();
      const b = draft(DRAFT_B);
      await render([a, b]);
      await click("Hold");
      expect(document.querySelector("[role=dialog]")?.textContent).toContain("Hold this draft?");
      if (change === "another band") await render([a, b], b.id);
      else await render([saved(a, { caption: "New creative not previously confirmed." }), b]);
      expect(document.querySelector("[role=dialog]")).toBeNull();
      expect(holdDraft).not.toHaveBeenCalled();
    },
  );

  it("closes a schedule dialog when its approved receipt changes", async () => {
    const a = draft(DRAFT_A, { status: "APPROVED" });
    await act(async () => root.render(<ReviewQueueClient drafts={[a]} />));
    await click("Schedule");
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Schedule this approved snapshot");
    const latest = saved(a, { status: "APPROVED", caption: "New approved creative." });
    await act(async () => root.render(<ReviewQueueClient drafts={[latest]} />));
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(scheduleApprovedDraft).not.toHaveBeenCalled();
  });

  it("protects retained unsaved work on beforeunload even when another band's clean desk is focused", async () => {
    const a = draft();
    const b = draft(DRAFT_B);
    await render([a, b]);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await click("Edit caption");
    await type("Caption", "Retain this through local focus changes.");
    const confirmLeave = jest.spyOn(window, "confirm").mockReturnValue(false);
    const leaveLink = document.createElement("a");
    leaveLink.href = "/dashboard";
    container.appendChild(leaveLink);
    const leave = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    leaveLink.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(field("Caption").value).toBe("Retain this through local focus changes.");
    confirmLeave.mockRestore();
    leaveLink.remove();
    await render([a, b], b.id);
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    await render([a, b], a.id);
    await click("Discard edits");
    const discarded = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(discarded);
    expect(discarded.defaultPrevented).toBe(false);
  });
});
