/**
 * Promo review desk after leftover #30.
 * Focus must open a review surface, not a leftover ring on a pile.
 * Nothing on this desk publishes. No X adapter. No Fault Lines.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROMO_PIPELINE_PATH,
  PROMO_PIPELINE_STEPS,
  REVIEW_DESK_MISSING_FOCUS,
  REVIEW_DESK_NO_PUBLISH,
  generationContextFacts,
  operatorPathPolicy,
  parseReviewDeskFocusId,
  previewablePromoMediaUrl,
  promoPipelineCurrentStep,
  promoPipelineSteps,
  reviewDeskAskedForFocus,
  reviewDeskCanArchive,
  reviewDeskCanCopy,
  reviewDeskCanDecide,
  reviewDeskCanMutateCreative,
  reviewDeskChromeNote,
  reviewDeskDoesNotPublish,
  reviewDeskFactRows,
  reviewDeskFocusMissing,
  reviewDeskNeighbors,
  reviewDeskPlatformNote,
  reviewDeskQueueHref,
  reviewDeskSamePileIds,
  reviewDeskScheduleHref,
} from "@/lib/services/publish/review-desk";
import { reviewQueueFocusHref } from "@/lib/services/publish/review-snapshot";

function readRepo(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("promo pipeline", () => {
  it("names Generate → Guard → Review → Approve → Schedule → Publish", () => {
    expect([...PROMO_PIPELINE_STEPS]).toEqual([
      "generate",
      "guard",
      "review",
      "approve",
      "schedule",
      "publish",
    ]);
    expect(PROMO_PIPELINE_PATH).toBe(
      "Generate → Guard → Review → Approve → Schedule → Publish"
    );
  });

  it("puts Jeff on Review for a new snapshot and on Schedule after Approve", () => {
    expect(promoPipelineCurrentStep("IN_REVIEW")).toBe("review");
    expect(promoPipelineCurrentStep("HELD")).toBe("review");
    expect(promoPipelineCurrentStep("APPROVED")).toBe("schedule");
    expect(promoPipelineCurrentStep("REJECTED")).toBe("off");
  });

  it("never makes Publish an actionable review-desk step", () => {
    for (const status of [
      "IN_REVIEW",
      "HELD",
      "APPROVED",
      "REJECTED",
      "SCHEDULED",
      "PUBLISHED",
    ]) {
      const publish = promoPipelineSteps(status).find((step) => step.id === "publish");
      expect(publish?.actionable).toBe(false);
    }

    const reviewing = promoPipelineSteps("IN_REVIEW");
    expect(reviewing.map((step) => [step.id, step.state, step.actionable])).toEqual([
      ["generate", "done", false],
      ["guard", "done", false],
      ["review", "current", true],
      ["approve", "upcoming", true],
      ["schedule", "upcoming", true],
      ["publish", "upcoming", false],
    ]);

    const approved = promoPipelineSteps("APPROVED");
    expect(approved.find((step) => step.id === "approve")?.state).toBe("done");
    expect(approved.find((step) => step.id === "schedule")?.state).toBe("current");
    expect(approved.find((step) => step.id === "publish")?.state).toBe("upcoming");
  });

  it("says the desk does not publish", () => {
    expect(reviewDeskDoesNotPublish()).toBe(false);
    expect(REVIEW_DESK_NO_PUBLISH).toMatch(/Approve, Hold, Deny, and Schedule/i);
    expect(REVIEW_DESK_NO_PUBLISH).toMatch(/None of them publish/i);
    expect(REVIEW_DESK_NO_PUBLISH).not.toMatch(/auto-publish/i);
  });

  it("keeps decide and mutate off SCHEDULED and PUBLISHED so Publish cannot be a desk yes", () => {
    expect(reviewDeskCanDecide("APPROVED")).toBe(true);
    expect(reviewDeskCanMutateCreative("APPROVED")).toBe(true);
    expect(reviewDeskCanDecide("SCHEDULED")).toBe(false);
    expect(reviewDeskCanMutateCreative("SCHEDULED")).toBe(false);
    expect(reviewDeskCanCopy("SCHEDULED")).toBe(false);
    expect(reviewDeskCanArchive("PUBLISHED")).toBe(false);
    expect(reviewDeskChromeNote("SCHEDULED")).toMatch(/no Publish button/i);
    expect(reviewDeskChromeNote("APPROVED")).toMatch(/Schedule is the next yes/i);
  });
});

describe("review desk focus after Approve → Schedule", () => {
  it("accepts a cuid and refuses junk that must not hit Prisma", () => {
    expect(parseReviewDeskFocusId("clhf5gt0000000test0draftid1")).toBe(
      "clhf5gt0000000test0draftid1"
    );
    expect(parseReviewDeskFocusId("javascript:alert(1)")).toBeNull();
    expect(parseReviewDeskFocusId("../admin")).toBeNull();
    expect(parseReviewDeskFocusId("")).toBeNull();
    expect(reviewDeskAskedForFocus("  leftover  ")).toBe(true);
    expect(reviewDeskAskedForFocus("")).toBe(false);
    expect(
      reviewDeskFocusMissing({
        askedForFocus: true,
        focusedDraftId: null,
      })
    ).toBe(true);
    expect(REVIEW_DESK_MISSING_FOCUS).toMatch(/not on the desk/i);
    expect(REVIEW_DESK_MISSING_FOCUS).toMatch(/Nothing was published/i);
  });

  it("surfaces the scheduled job so the desk does not evaporate after Schedule", () => {
    const rows = reviewDeskFactRows({
      scheduledPost: {
        scheduledFor: new Date("2026-09-20T19:00:00.000Z"),
        platformAccount: { handle: "stalematechi", isConnected: false },
        job: { status: "PENDING" },
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Account", value: "@stalematechi (mock)" },
        { label: "Worker job", value: "PENDING" },
      ])
    );
    expect(rows.some((row) => row.label === "Scheduled for")).toBe(true);
    expect(reviewDeskScheduleHref()).toBe("/scheduled-posts");
  });
});

describe("operator path policy", () => {
  it("locks the path and never offers an auto-publish switch", () => {
    const rows = operatorPathPolicy({
      llmAdapter: "mock",
      socialAdapter: "mock",
    });
    expect(rows.every((row) => row.locked)).toBe(true);
    expect(rows.map((row) => row.label)).toEqual([
      "Path",
      "Approve / Hold / Deny",
      "Schedule",
      "Publish",
      "Live destinations",
      "Real writes",
      "LLM",
    ]);
    expect(rows.find((row) => row.label === "Publish")?.value).toMatch(
      /Never a desk button/i
    );
    expect(rows.find((row) => row.label === "Publish")?.value).toMatch(
      /Never auto-publish/i
    );
    expect(rows.find((row) => row.label === "Live destinations")?.value).toMatch(
      /No X adapter/i
    );
    expect(JSON.stringify(rows)).not.toMatch(/fault.?lines/i);
  });
});

describe("review desk neighbors", () => {
  const pile = [
    { id: "a", status: "IN_REVIEW" },
    { id: "b", status: "APPROVED" },
    { id: "c", status: "IN_REVIEW" },
    { id: "d", status: "IN_REVIEW" },
  ];

  it("walks the same-status pile so Jeff can review the waiting work", () => {
    expect(reviewDeskSamePileIds(pile, "c")).toEqual(["a", "c", "d"]);
    expect(reviewDeskNeighbors(["a", "c", "d"], "c")).toEqual({
      previousId: "a",
      nextId: "d",
      position: 2,
      total: 3,
    });
    expect(reviewDeskNeighbors(["a", "c", "d"], "a").previousId).toBeNull();
    expect(reviewDeskNeighbors(["a", "c", "d"], "d").nextId).toBeNull();
  });

  it("returns an empty pile when the focused snapshot left the queue", () => {
    expect(reviewDeskSamePileIds(pile, "missing")).toEqual([]);
    expect(reviewDeskNeighbors([], "missing")).toEqual({
      previousId: null,
      nextId: null,
      position: 0,
      total: 0,
    });
  });
});

describe("review desk facts Jeff needs", () => {
  it("surfaces campaign, CTA, show context, and voice — not an empty card", () => {
    const rows = reviewDeskFactRows({
      ctaText: "Tickets in bio",
      altText: "Rad Dad at Lincoln Hall",
      confidenceNotes: "Hits the cover-band voice.",
      campaign: { name: "Lincoln Hall — Pop Punk Night", type: "SHOW_ANNOUNCEMENT" },
      generationRun: {
        campaignType: "SHOW_ANNOUNCEMENT",
        inputContext: {
          venue: "Lincoln Hall",
          city: "Chicago",
          showDate: "2026-09-20",
        },
      },
      band: {
        voiceProfile: {
          toneRules: ["Name the songs.", "Do not invent history."],
          bannedPhrases: ["grab your tickets now"],
        },
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Campaign", value: "Lincoln Hall — Pop Punk Night" },
        { label: "Type", value: "Show Announcement" },
        { label: "Venue", value: "Lincoln Hall" },
        { label: "City", value: "Chicago" },
        { label: "Show date", value: "2026-09-20" },
        { label: "CTA", value: "Tickets in bio" },
        { label: "Alt text", value: "Rad Dad at Lincoln Hall" },
        { label: "Why this draft", value: "Hits the cover-band voice." },
        { label: "Voice", value: "Name the songs. · Do not invent history." },
        { label: "Never say", value: "grab your tickets now" },
      ])
    );
  });

  it("omits empty leftover fields so Jeff is not reading blanks", () => {
    expect(reviewDeskFactRows({})).toEqual([]);
    expect(generationContextFacts("not-an-object")).toEqual({
      venue: null,
      city: null,
      showDate: null,
    });
    expect(generationContextFacts({ venue: "  " })).toEqual({
      venue: null,
      city: null,
      showDate: null,
    });
  });

  it("previews only public https images", () => {
    expect(
      previewablePromoMediaUrl("https://cdn.example.com/show.jpg")
    ).toBe("https://cdn.example.com/show.jpg");
    expect(previewablePromoMediaUrl("http://cdn.example.com/show.jpg")).toBeNull();
    expect(
      previewablePromoMediaUrl("https://user:pass@cdn.example.com/show.jpg")
    ).toBeNull();
    expect(previewablePromoMediaUrl("https://cdn.example.com/clip.mp4")).toBeNull();
    expect(previewablePromoMediaUrl("javascript:alert(1)")).toBeNull();
  });

  it("names live destinations and leftover platforms without adding X", () => {
    expect(reviewDeskPlatformNote("FACEBOOK")).toMatch(/do not publish/i);
    expect(reviewDeskPlatformNote("INSTAGRAM")).toMatch(/https image or video/i);
    expect(reviewDeskPlatformNote("YOUTUBE")).toMatch(/Text posts stay manual/i);
    expect(reviewDeskPlatformNote("TWITTER")).toMatch(/schema leftover/i);
    expect(reviewDeskPlatformNote("TWITTER")).toMatch(/No tweet will go out/i);
    expect(reviewDeskPlatformNote("TIKTOK")).toMatch(/not a live destination/i);
  });
});

describe("review desk wiring after leftover #30", () => {
  it("keeps focus href and adds a way back to the queue", () => {
    expect(reviewQueueFocusHref("clhf5gt0000000test0draftid1")).toBe(
      "/review-queue?focus=clhf5gt0000000test0draftid1"
    );
    expect(reviewDeskQueueHref()).toBe("/review-queue");
  });

  it("opens a focused desk instead of only ringing a card in the pile", () => {
    const client = readRepo("app/(app)/review-queue/client.tsx");
    const page = readRepo("app/(app)/review-queue/page.tsx");

    expect(client).toMatch(/PromoPipeline/);
    expect(client).toMatch(/reviewDeskSamePileIds/);
    expect(client).toMatch(/reviewDeskNeighbors/);
    expect(client).toMatch(/reviewDeskFactRows/);
    expect(client).toMatch(/variant="desk"/);
    expect(client).toMatch(/Open review desk/);
    expect(client).toMatch(/reviewDeskQueueHref/);
    expect(client).not.toMatch(/>[\s]*Publish[\s]*</);
    expect(page).toMatch(/generationRun:/);
    expect(page).toMatch(/scheduledPost:/);
    expect(page).toMatch(/parseReviewDeskFocusId/);
    expect(page).toMatch(/PROMO_PIPELINE_PATH/);
    expect(client).toMatch(/focusMissing/);
    expect(client).toMatch(/REVIEW_DESK_MISSING_FOCUS/);
    expect(client).toMatch(/reviewedSnapshot: cardReceipt\(draft\)/);
    expect(client).toMatch(/reviewDecisionRail/);
    expect(client).toMatch(/ReviewDecisionRail/);
    expect(client).toMatch(/Open scheduled jobs/);
  });

  it("lets Dashboard, Calendar, and Scheduled Posts continue the desk walk", () => {
    expect(readRepo("app/(app)/dashboard/page.tsx")).toMatch(
      /reviewQueueFocusHref\(post\.draft\.id\)/
    );
    expect(readRepo("app/(app)/dashboard/page.tsx")).toMatch(
      /Approved — schedule is the next yes/
    );
    expect(readRepo("app/(app)/calendar/page.tsx")).toMatch(
      /reviewQueueFocusHref\(post\.draft\.id\)/
    );
    expect(readRepo("app/(app)/scheduled-posts/page.tsx")).toMatch(
      /reviewQueueFocusHref\(post\.draft\.id\)/
    );
    expect(readRepo("app/(app)/settings/page.tsx")).toMatch(/operatorPathPolicy/);
    expect(readRepo("app/(app)/settings/page.tsx")).not.toMatch(/<Switch/);
  });

  it("makes Generate name the same six-step path", () => {
    const studio = readRepo("app/(app)/content-studio/client.tsx");
    expect(studio).toMatch(/PROMO_PIPELINE_PATH/);
    expect(studio).toMatch(/Nothing auto-publishes/);
  });

  it("does not add Fault Lines or a real X adapter on this product pass", () => {
    const desk = readRepo("lib/services/publish/review-desk.ts");
    const client = readRepo("app/(app)/review-queue/client.tsx");
    expect(desk).not.toMatch(/fault.?lines/i);
    expect(desk).not.toMatch(/twitter-adapter|x-adapter\.ts/i);
    expect(desk).toMatch(/No X adapter/);
    expect(client).toMatch(/Twitter\/X is schema leftover/);
    expect(readRepo("lib/adapters/social/index.ts")).toMatch(
      /return refusedTwitterAdapter/
    );
  });
});
