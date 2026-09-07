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
  reviewDeskFactsNote,
  reviewDeskFocusMissing,
  reviewDeskNextAction,
  reviewDeskSnapshotCue,
  reviewDeskNeighbors,
  reviewDeskPlatformNote,
  reviewDeskQueueHref,
  reviewDeskSamePileIds,
  reviewDeskScheduleHref,
  REVIEW_DESK_SAVED_FACTS_NOTE,
  REVIEW_DESK_UNLINKED_FACTS_NOTE,
} from "@/lib/services/publish/review-desk";
import { displayCampaignInstant } from "@/lib/services/content/campaign-context";
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
    expect(rows).toContainEqual({
      label: "Scheduled for",
      value: displayCampaignInstant("2026-09-20T19:00:00.000Z"),
    });
    expect(rows.find((row) => row.label === "Scheduled for")?.value).toContain(
      "America/Chicago"
    );
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

  it("surfaces the saved campaign/event snapshot Studio generated with, including honest gaps", () => {
    const rows = reviewDeskFactRows({
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
            campaignId: "campaign-1",
            eventId: "event-1",
            receipt: "storyliner-campaign-context-v1",
            displayTimeZone: "America/Chicago",
          },
        },
      },
      band: {
        voiceProfile: {
          toneRules: [
            "Never beg.",
            "No exclamation marks unless absolutely unavoidable.",
            "Do not explain the joke.",
            "Do not use the word 'journey'.",
            "Dry is better than hype.",
          ],
          bannedPhrases: [
            "journey",
            "excited to announce",
            "don't miss out",
            "limited tickets",
            "grab your tickets now",
            "unforgettable experience",
            "community",
          ],
        },
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Origin", value: "Saved campaign" },
        { label: "Campaign", value: "Lincoln Hall — Pop Punk Night" },
        { label: "Event", value: "Lincoln Hall — Pop Punk Night" },
        {
          label: "Campaign target date",
          value: "Saturday, September 19, 2026 at 7:00 PM CDT (America/Chicago)",
        },
        {
          label: "Ticket URL",
          value: "https://example.test/lincoln-tickets",
        },
      ])
    );
    expect(rows.some((row) => row.label === "Doors")).toBe(false);
    expect(rows.some((row) => row.label === "Set time")).toBe(false);
    expect(rows).toContainEqual({
      label: "Operator note",
      value: "Jeff: name the room, not the ticket FOMO.",
    });
    expect(rows).toContainEqual({
      label: "Not saved",
      value: "Doors time not saved · Set time not saved",
    });
    expect(rows.find((row) => row.label === "Voice")?.value).toContain("Dry is better than hype.");
    expect(rows.find((row) => row.label === "Never say")?.value).toContain("community");
    expect(JSON.stringify(rows)).not.toMatch(/8:00\s*PM/);
    expect(JSON.stringify(rows)).not.toMatch(/fault.?lines/i);
    expect(reviewDeskFactsNote({
      source: { kind: "saved-campaign-event" },
    })).toBe(REVIEW_DESK_SAVED_FACTS_NOTE);
  });

  it("does not invent event times for a saved campaign without an event", () => {
    const rows = reviewDeskFactRows({
      campaign: { name: "September reminder", type: "REMINDER" },
      generationRun: {
        campaignType: "REMINDER",
        inputContext: {
          campaignName: "September reminder",
          campaignTargetDate: "Friday, October 2, 2026 at 7:00 PM CDT (America/Chicago)",
          missingFacts: ["No event linked — event dates, venue, and times are not supplied"],
          source: {
            kind: "saved-campaign-event",
            campaignId: "campaign-2",
            eventId: null,
            displayTimeZone: "America/Chicago",
          },
        },
      },
    });

    expect(rows).toContainEqual({ label: "Origin", value: "Saved campaign" });
    expect(rows).toContainEqual({
      label: "Not saved",
      value: "No event linked — event dates, venue, and times are not supplied",
    });
    expect(rows.some((row) => row.label === "Show date")).toBe(false);
    expect(rows.some((row) => row.label === "Venue")).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/\b8pm\b/i);
    expect(JSON.stringify(rows)).not.toMatch(/Saturday/);
  });

  it("derives missing saved facts when an older linked snapshot omitted the list", () => {
    const facts = generationContextFacts({
      venue: "Lincoln Hall",
      city: "Chicago",
      showDate: "Saturday, September 19, 2026 at 7:00 PM CDT (America/Chicago)",
      source: { kind: "saved-campaign-event", eventId: "event-1" },
    });
    expect(facts.origin).toBe("saved-campaign-event");
    expect(facts.missingFacts).toEqual([
      "Doors time not saved",
      "Set time not saved",
      "Ticket link not saved",
    ]);
    expect(facts.doorsTime).toBeNull();
    expect(facts.setTime).toBeNull();
  });

  it("keeps unlinked operator facts from becoming a saved-campaign claim", () => {
    const rows = reviewDeskFactRows({
      generationRun: {
        campaignType: "REHEARSAL",
        inputContext: {
          venue: "Operator supplied room",
          eventDetails: "Operator supplied detail",
          additionalContext: "Manual note",
          source: { kind: "operator-supplied", bandId: "band-1" },
        },
      },
    });
    expect(rows).toContainEqual({ label: "Origin", value: "Unlinked draft" });
    expect(rows).toContainEqual({ label: "Venue", value: "Operator supplied room" });
    expect(rows).toContainEqual({ label: "Operator note", value: "Manual note" });
    expect(rows.some((row) => row.label === "Not saved")).toBe(false);
    expect(reviewDeskFactsNote({
      source: { kind: "operator-supplied" },
    })).toBe(REVIEW_DESK_UNLINKED_FACTS_NOTE);
  });

  it("refuses non-https ticket links and does not echo a generation receipt", () => {
    const rows = reviewDeskFactRows({
      generationRun: {
        campaignType: "SHOW_ANNOUNCEMENT",
        inputContext: {
          ticketUrl: "javascript:alert(1)",
          source: {
            kind: "saved-campaign-event",
            eventId: "event-1",
            receipt: "do-not-show-this-receipt",
          },
        },
      },
    });
    expect(rows.some((row) => row.label === "Ticket URL")).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("do-not-show-this-receipt");
    expect(JSON.stringify(rows)).not.toContain("javascript:");
  });

  it("names a one-line snapshot cue without inventing Saturday/8pm or echoing tickets", () => {
    const linked = reviewDeskSnapshotCue({
      campaign: { name: "Lincoln Hall — Pop Punk Night" },
      generationRun: {
        inputContext: {
          ticketUrl: "https://example.test/lincoln-tickets",
          missingFacts: ["Doors time not saved", "Set time not saved"],
          source: { kind: "saved-campaign-event", eventId: "event-1" },
        },
      },
    });
    expect(linked).toMatchObject({
      origin: "saved-campaign-event",
      headline: "Lincoln Hall — Pop Punk Night",
      missingLabel: "2 facts not saved",
      line: "Saved campaign · Lincoln Hall — Pop Punk Night · 2 facts not saved",
    });
    expect(linked?.line).not.toMatch(/ticket|8:00\s*PM|javascript:/i);

    expect(
      reviewDeskSnapshotCue({
        generationRun: {
          inputContext: {
            missingFacts: [
              "No event linked — event dates, venue, and times are not supplied",
            ],
            source: { kind: "saved-campaign-event", campaignId: "c1" },
          },
        },
      })?.line
    ).toBe("Saved campaign · No event linked");

    expect(
      reviewDeskSnapshotCue({
        generationRun: {
          inputContext: {
            venue: "Operator supplied room",
            source: { kind: "operator-supplied" },
          },
        },
      })?.line
    ).toBe("Unlinked draft · Operator supplied room");

    expect(reviewDeskSnapshotCue({ generationRun: { inputContext: { venue: "Room" } } })).toBeNull();
    expect(reviewDeskSnapshotCue({})).toBeNull();
  });

  it("asks the next action to check generation facts before the yes", () => {
    const linked = {
      inputContext: {
        campaignName: "Lincoln Hall — Pop Punk Night",
        missingFacts: ["Doors time not saved", "Set time not saved"],
        source: { kind: "saved-campaign-event", eventId: "event-1" },
      },
    };
    expect(
      reviewDeskNextAction({
        status: "IN_REVIEW",
        inputContext: linked.inputContext,
        campaign: { name: "Lincoln Hall — Pop Punk Night" },
      })
    ).toBe(
      "Check saved campaign facts (2 facts not saved), then Approve, Hold, or Deny. None of those publish."
    );
    expect(
      reviewDeskNextAction({
        status: "HELD",
        inputContext: linked.inputContext,
      })
    ).toMatch(/Check saved campaign facts/i);
    expect(
      reviewDeskNextAction({
        status: "APPROVED",
        inputContext: linked.inputContext,
      })
    ).toMatch(/Schedule is the next yes/i);
    expect(
      reviewDeskNextAction({
        status: "IN_REVIEW",
        inputContext: {
          venue: "Operator supplied room",
          source: { kind: "operator-supplied" },
        },
      })
    ).toMatch(/unlinked generate facts/i);
    expect(reviewDeskNextAction({ status: "IN_REVIEW" })).toMatch(
      /Approve, Hold, or Deny this snapshot/i
    );
    expect(reviewDeskNextAction({ status: "SCHEDULED" })).toMatch(/no Publish button/i);
  });

  it("omits empty leftover fields so Jeff is not reading blanks", () => {
    expect(reviewDeskFactRows({})).toEqual([]);
    expect(generationContextFacts("not-an-object")).toMatchObject({
      origin: "unknown",
      venue: null,
      city: null,
      showDate: null,
      missingFacts: [],
    });
    expect(generationContextFacts({ venue: "  " })).toMatchObject({
      origin: "unknown",
      venue: null,
      city: null,
      showDate: null,
      missingFacts: [],
    });
    expect(reviewDeskFactsNote({ venue: "Lincoln Hall" })).toBeNull();
  });

  it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])(
    "keeps Scheduled for in America/Chicago when the host timezone is %s",
    (hostTimezone) => {
      const previousTimezone = process.env.TZ;
      try {
        process.env.TZ = hostTimezone;
        const rows = reviewDeskFactRows({
          scheduledPost: { scheduledFor: new Date("2026-09-06T00:30:00.000Z") },
        });
        expect(rows).toContainEqual({
          label: "Scheduled for",
          value: "Saturday, September 5, 2026 at 7:30 PM CDT (America/Chicago)",
        });
      } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
      }
    }
  );

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
    expect(client).toMatch(/reviewDeskFactsNote/);
    expect(client).toMatch(/reviewDeskSnapshotCue/);
    expect(client).toMatch(/reviewDeskNextAction/);
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
    expect(readRepo("app/(app)/dashboard/page.tsx")).toMatch(/heldCount: heldWaiting\.length/);
    expect(readRepo("app/(app)/dashboard/page.tsx")).toMatch(/reviewDeskSnapshotCue/);
    expect(readRepo("app/(app)/dashboard/page.tsx")).toMatch(/reviewFactsCue/);
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
