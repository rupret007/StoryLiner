/** @jest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), prefetch: jest.fn() }),
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
import { REVIEW_DESK_SAVED_FACTS_NOTE } from "@/lib/services/publish/review-desk";

type ReviewDraft = ComponentProps<typeof ReviewQueueClient>["drafts"][number];
const DRAFT_ID = "clhf5gt0000000test0draftid1";
const INITIAL_TIME = new Date("2026-09-05T00:00:00.000Z");

function linkedDraft(): ReviewDraft {
  return {
    id: DRAFT_ID,
    bandId: "fixture-rad-dad",
    campaignId: "fixture-campaign",
    generationRunId: "fixture-run",
    platform: "FACEBOOK",
    status: "SCHEDULED",
    toneVariant: "ENERGETIC",
    contentLength: "MEDIUM",
    caption: "Rad Dad at Lincoln Hall. Come sing it.",
    hashtags: ["#raddad"],
    mediaUrls: ["https://example.test/lincoln.jpg"],
    ctaText: "Tickets in bio",
    altText: "Rad Dad at Lincoln Hall",
    imagePrompt: null,
    fanReplies: [],
    brandFitScore: 80,
    confidenceNotes: "Hits the cover-band voice.",
    riskLevel: "LOW",
    riskFlags: [],
    reviewedAt: INITIAL_TIME,
    reviewNotes: null,
    rejectedAt: null,
    rejectedReason: null,
    currentVersion: 1,
    createdAt: INITIAL_TIME,
    updatedAt: INITIAL_TIME,
    band: {
      id: "fixture-rad-dad",
      userId: "fixture-local-operator",
      name: "Rad Dad",
      slug: "fixture-rad-dad",
      description: null,
      genre: null,
      location: null,
      founded: null,
      coverColor: "#335577",
      isActive: true,
      createdAt: INITIAL_TIME,
      updatedAt: INITIAL_TIME,
      voiceProfile: {
        id: "fixture-voice",
        bandId: "fixture-rad-dad",
        toneDescription: "Crowd-first cover-band energy.",
        personalityTraits: ["loud"],
        audienceNotes: "People who already know the songs.",
        postingGoals: ["Get the room singing"],
        humorLevel: 8,
        edgeLevel: 3,
        emojiTolerance: 5,
        isExplicitOk: false,
        defaultTone: "ENERGETIC",
        preferredLengths: ["MEDIUM"],
        facebookNotes: null,
        instagramNotes: null,
        blueskyNotes: null,
        tiktokNotes: null,
        youtubeNotes: null,
        twitchNotes: null,
        toneRules: [
          "Never sound corporate or formal.",
          "The singalong is always the point. Center it.",
          "Crowd first. Always.",
          "Abbreviations and informal language are fine.",
          "You can mention Mr. Brightside. Once. Per show.",
        ],
        bannedPhrases: [
          "critically acclaimed",
          "music journey",
          "authentic experience",
          "world-class",
          "industry",
          "monetize",
          "content creator",
        ],
        bannedTopics: ["political opinions"],
        goodExamples: [],
        badExamples: [],
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME,
      },
      platformAccounts: [],
    },
    versions: [],
    campaign: {
      id: "fixture-campaign",
      bandId: "fixture-rad-dad",
      eventId: "fixture-event",
      name: "Lincoln Hall — Pop Punk Night",
      type: "SHOW_ANNOUNCEMENT",
      description: "Announce the room.",
      targetDate: new Date("2026-09-20T00:00:00.000Z"),
      isActive: true,
      createdAt: INITIAL_TIME,
      updatedAt: INITIAL_TIME,
    },
    generationRun: {
      campaignType: "SHOW_ANNOUNCEMENT",
      inputContext: {
        campaignName: "Lincoln Hall — Pop Punk Night",
        campaignDescription: "Announce the room. Do not invent an opener.",
        campaignTargetDate: "Saturday, September 19, 2026 at 7:00 PM CDT (America/Chicago)",
        eventDetails: "Lincoln Hall — Pop Punk Night",
        showDate: "Saturday, September 19, 2026 at 7:00 PM CDT (America/Chicago)",
        venue: "Lincoln Hall",
        city: "Chicago",
        ticketUrl: "https://example.test/lincoln-tickets",
        additionalContext: "Jeff: name the room, not the ticket FOMO.",
        missingFacts: ["Doors time not saved", "Set time not saved"],
        source: {
          kind: "saved-campaign-event",
          campaignId: "fixture-campaign",
          eventId: "fixture-event",
          displayTimeZone: "America/Chicago",
        },
      },
    },
    scheduledPost: {
      scheduledFor: new Date("2026-09-06T00:30:00.000Z"),
      status: "SCHEDULED",
      platformAccount: { handle: "raddadchi", isConnected: false },
      job: { status: "PENDING", runAt: new Date("2026-09-06T00:30:00.000Z") },
    },
  };
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
  globalThis.fetch = jest.fn().mockRejectedValue(
    new Error("UI fixtures must not contact a provider or database.")
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

describe("review desk saved-fact honesty", () => {
  it("shows the generated campaign snapshot, missing times, full voice, and Central schedule", async () => {
    await act(async () => {
      root.render(
        <ReviewQueueClient drafts={[linkedDraft()]} focusDraftId={DRAFT_ID} />
      );
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Saved campaign");
    expect(text).toContain("Lincoln Hall — Pop Punk Night");
    expect(text).toContain("Announce the room. Do not invent an opener.");
    expect(text).toContain("Doors time not saved");
    expect(text).toContain("Set time not saved");
    expect(text).toContain("https://example.test/lincoln-tickets");
    expect(text).toContain("Jeff: name the room, not the ticket FOMO.");
    expect(text).toContain("You can mention Mr. Brightside. Once. Per show.");
    expect(text).toContain("content creator");
    expect(text).toContain("Saturday, September 5, 2026 at 7:30 PM CDT (America/Chicago)");
    expect(text).toContain(REVIEW_DESK_SAVED_FACTS_NOTE);
    expect(text).toContain("This desk has no Publish button");
    expect(text).not.toMatch(/8:00\s*PM/);
    expect(text).not.toMatch(/fault.?lines/i);
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Publish"
      )
    ).toBe(false);
  });

  it("does not invent event facts on an unlinked desk", async () => {
    const draft = linkedDraft();
    draft.campaignId = null;
    draft.campaign = null;
    draft.status = "IN_REVIEW";
    draft.scheduledPost = null;
    draft.generationRun = {
      campaignType: "REHEARSAL",
      inputContext: {
        venue: "Operator supplied room",
        additionalContext: "Manual note",
        source: { kind: "operator-supplied", bandId: "fixture-rad-dad" },
      },
    };

    await act(async () => {
      root.render(
        <ReviewQueueClient drafts={[draft]} focusDraftId={DRAFT_ID} />
      );
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Unlinked draft");
    expect(text).toContain("Operator supplied room");
    expect(text).toContain("Manual note");
    expect(text).not.toContain("Doors time not saved");
    expect(text).not.toContain("No event linked");
    expect(text).not.toMatch(/\b8pm\b/i);
  });
});
