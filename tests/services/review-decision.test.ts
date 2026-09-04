/**
 * Review decision rail. Approve / Hold / Deny / Schedule must be
 * distinct verbs with one next yes. None of them publish.
 * No X adapter. No Fault Lines.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVIEW_DECISION_IDS,
  REVIEW_QUEUE_DECISION_HELP,
  reviewCardTools,
  reviewDecisionConsequence,
  reviewDecisionHeading,
  reviewDecisionIdsForStatus,
  reviewDecisionNextYesId,
  reviewDecisionPresentation,
  reviewDecisionPublishes,
  reviewDecisionRail,
} from "@/lib/services/publish/review-decision";
import { reviewCardNextAction } from "@/lib/services/publish/review-snapshot";
import {
  assertCanApproveDraft,
  assertCanDenyDraft,
  assertCanHoldDraft,
  assertCanResumeHeldDraft,
} from "@/lib/services/publish/safety";

function readRepo(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("review decision availability matches the server gates", () => {
  it("shows Approve / Hold / Deny on Needs Review, and Schedule only after Approve", () => {
    expect(reviewDecisionIdsForStatus("IN_REVIEW")).toEqual([
      "approve",
      "hold",
      "deny",
    ]);
    expect(reviewDecisionIdsForStatus("HELD")).toEqual([
      "approve",
      "resume",
      "deny",
    ]);
    expect(reviewDecisionIdsForStatus("APPROVED")).toEqual([
      "schedule",
      "hold",
    ]);
    expect(reviewDecisionIdsForStatus("REJECTED")).toEqual([]);
    expect(reviewDecisionIdsForStatus("SCHEDULED")).toEqual([]);
    expect(reviewDecisionIdsForStatus("PUBLISHED")).toEqual([]);
  });

  it("names one next yes: Approve in review/hold, Schedule after Approve", () => {
    expect(reviewDecisionNextYesId("IN_REVIEW")).toBe("approve");
    expect(reviewDecisionNextYesId("HELD")).toBe("approve");
    expect(reviewDecisionNextYesId("APPROVED")).toBe("schedule");
    expect(reviewDecisionNextYesId("REJECTED")).toBeNull();
    expect(reviewDecisionNextYesId("SCHEDULED")).toBeNull();
  });

  it("keeps the rail aligned with Approve / Hold / Deny / Resume status gates", () => {
    expect(assertCanApproveDraft({ status: "IN_REVIEW", riskLevel: "LOW" }).ok).toBe(
      true
    );
    expect(assertCanApproveDraft({ status: "HELD", riskLevel: "LOW" }).ok).toBe(
      true
    );
    expect(
      assertCanApproveDraft({ status: "APPROVED", riskLevel: "LOW" }).ok
    ).toBe(false);
    expect(assertCanHoldDraft({ status: "IN_REVIEW" }).ok).toBe(true);
    expect(assertCanHoldDraft({ status: "APPROVED" }).ok).toBe(true);
    expect(assertCanHoldDraft({ status: "HELD" }).ok).toBe(false);
    expect(assertCanDenyDraft({ status: "IN_REVIEW" }).ok).toBe(true);
    expect(assertCanDenyDraft({ status: "HELD" }).ok).toBe(true);
    expect(assertCanDenyDraft({ status: "APPROVED" }).ok).toBe(false);
    expect(assertCanResumeHeldDraft({ status: "HELD" }).ok).toBe(true);
    expect(assertCanResumeHeldDraft({ status: "IN_REVIEW" }).ok).toBe(false);
  });
});

describe("review decision consequences", () => {
  it("tells Approve / Hold / Deny / Schedule apart without claiming a live post", () => {
    const approve = reviewDecisionConsequence("approve");
    const hold = reviewDecisionConsequence("hold");
    const deny = reviewDecisionConsequence("deny");
    const schedule = reviewDecisionConsequence("schedule");

    expect(approve).toMatch(/Ready to schedule/i);
    expect(approve).toMatch(/Not live/i);
    expect(hold).toMatch(/Park for later/i);
    expect(hold).toMatch(/Not scheduled/i);
    expect(deny).toMatch(/Reject this caption/i);
    expect(schedule).toMatch(/Queue a worker job/i);
    expect(schedule).toMatch(/Still not live/i);

    for (const id of REVIEW_DECISION_IDS) {
      expect(reviewDecisionPublishes(id)).toBe(false);
      const text = reviewDecisionConsequence(id);
      expect(text).not.toMatch(/will publish|goes live|auto-publish|now live/i);
      expect(text).not.toMatch(/fault.?lines/i);
    }
  });

  it("warns on high-risk Approve and a possible live write before Schedule", () => {
    expect(
      reviewDecisionConsequence("approve", { riskLevel: "HIGH" })
    ).toMatch(/Guard flagged this/i);
    expect(
      reviewDecisionConsequence("schedule", { possibleLiveWrite: true })
    ).toMatch(/Check the live page/i);
    expect(
      reviewDecisionConsequence("hold", { possibleLiveWrite: true })
    ).toMatch(/live-page check stays/i);
  });
});

describe("review decision rail view", () => {
  it("marks exactly one next yes and never a Publish decision", () => {
    const reviewing = reviewDecisionRail({ status: "IN_REVIEW" });
    expect(reviewing.heading).toBe(reviewDecisionHeading("IN_REVIEW"));
    expect(reviewing.nextYesId).toBe("approve");
    expect(reviewing.decisions.map((d) => [d.id, d.nextYes, d.publishes])).toEqual([
      ["approve", true, false],
      ["hold", false, false],
      ["deny", false, false],
    ]);
    expect(reviewing.decisions.find((d) => d.id === "approve")?.label).toBe(
      "Approve"
    );
    expect(reviewing.decisions.some((d) => d.id === "schedule")).toBe(false);

    const approved = reviewDecisionRail({
      status: "APPROVED",
      surface: "queue",
    });
    expect(approved.nextYesId).toBe("schedule");
    expect(approved.decisions[0]).toMatchObject({
      id: "schedule",
      nextYes: true,
      presentation: "button",
      publishes: false,
    });
    expect(approved.decisions.some((d) => d.id === "approve")).toBe(false);
  });

  it("opens Schedule inline on the approved desk, not as another pile button", () => {
    expect(
      reviewDecisionPresentation("schedule", {
        status: "APPROVED",
        surface: "desk",
      })
    ).toBe("inline");
    expect(
      reviewDecisionPresentation("schedule", {
        status: "APPROVED",
        surface: "queue",
      })
    ).toBe("button");
    expect(
      reviewDecisionRail({ status: "APPROVED", surface: "desk" }).decisions[0]
        .presentation
    ).toBe("inline");
  });

  it("keeps Edit / Copy / Archive off SCHEDULED and PUBLISHED", () => {
    expect(reviewCardTools("IN_REVIEW")).toEqual({
      edit: true,
      copy: true,
      archive: true,
    });
    expect(reviewCardTools("APPROVED").edit).toBe(true);
    expect(reviewCardTools("REJECTED")).toEqual({
      edit: false,
      copy: true,
      archive: true,
    });
    expect(reviewCardTools("SCHEDULED")).toEqual({
      edit: false,
      copy: false,
      archive: false,
    });
    expect(reviewCardTools("PUBLISHED")).toEqual({
      edit: false,
      copy: false,
      archive: false,
    });
  });
});

describe("review card next-action heading stays the rail heading", () => {
  it("does not drift from the leftover Generate → Guard → Review copy", () => {
    for (const status of [
      "IN_REVIEW",
      "HELD",
      "APPROVED",
      "REJECTED",
      "SCHEDULED",
      "PUBLISHED",
      "ARCHIVED",
    ]) {
      expect(reviewCardNextAction({ status })).toBe(
        reviewDecisionHeading(status)
      );
    }
  });
});

describe("review decision rail wiring", () => {
  it("puts the four verbs on the queue card and Schedule on the approved desk", () => {
    const client = readRepo("app/(app)/review-queue/client.tsx");
    const rail = readRepo("components/storyliner/review-decision-rail.tsx");

    expect(client).toMatch(/reviewDecisionRail\(/);
    expect(client).toMatch(/<ReviewDecisionRail/);
    expect(client).toMatch(/REVIEW_QUEUE_DECISION_HELP/);
    expect(client).toMatch(/scheduleForm=/);
    expect(client).not.toMatch(/>[\s]*Publish[\s]*</);
    expect(rail).toMatch(/aria-label="Review decisions"/);
    expect(rail).toMatch(/Next yes/);
    expect(rail).toMatch(/data-decision=/);
    expect(REVIEW_QUEUE_DECISION_HELP).toMatch(/Approve readies a schedule/i);
    expect(REVIEW_QUEUE_DECISION_HELP).toMatch(/Hold parks/i);
    expect(REVIEW_QUEUE_DECISION_HELP).toMatch(/Deny rejects/i);
    expect(REVIEW_QUEUE_DECISION_HELP).toMatch(/Schedule queues a job/i);
    expect(REVIEW_QUEUE_DECISION_HELP).toMatch(/None of those go live/i);
  });

  it("does not add Fault Lines or a real X adapter on this product pass", () => {
    const decision = readRepo("lib/services/publish/review-decision.ts");
    expect(decision).not.toMatch(/fault.?lines/i);
    expect(decision).not.toMatch(/twitter-adapter|x-adapter\.ts/i);
    expect(decision).toMatch(/never publish/i);
  });
});
