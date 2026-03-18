import {
  checkHardGuardrails,
  checkBandVoiceSeparation,
  checkAutoPublishGuard,
} from "@/lib/services/guardrails/policy";

describe("checkHardGuardrails", () => {
  it("returns no violations for clean, on-brand content", () => {
    const violations = checkHardGuardrails(
      "Playing Burlington Bar on Saturday. Doors at 8."
    );
    expect(violations).toHaveLength(0);
  });

  it("flags LinkedIn-influencer phrasing", () => {
    const violations = checkHardGuardrails(
      "Excited to announce our upcoming show at Lincoln Hall!"
    );
    expect(violations.some((v) => v.rule === "no-linkedin-tone")).toBe(true);
  });

  it("flags another LinkedIn phrase: 'honored to share'", () => {
    const violations = checkHardGuardrails(
      "We are honored to share this news with our community."
    );
    expect(violations.some((v) => v.rule === "no-linkedin-tone")).toBe(true);
  });

  it("flags obvious AI phrasing: 'dive into'", () => {
    const violations = checkHardGuardrails(
      "Let's dive into what makes this show special."
    );
    expect(violations.some((v) => v.rule === "no-obvious-ai")).toBe(true);
  });

  it("flags obvious AI phrasing: 'delve into'", () => {
    const violations = checkHardGuardrails(
      "We delve into the creative process behind our new record."
    );
    expect(violations.some((v) => v.rule === "no-obvious-ai")).toBe(true);
  });

  it("flags fake accomplishment claims", () => {
    const violations = checkHardGuardrails(
      "Our award-winning performance is coming to Lincoln Hall."
    );
    expect(violations.some((v) => v.rule === "no-fake-accomplishments")).toBe(true);
  });

  it("flags exclamation mark overuse", () => {
    const violations = checkHardGuardrails(
      "Show tonight!!! Can't wait!!! Tickets available!!!"
    );
    expect(violations.some((v) => v.rule === "exclamation-overuse")).toBe(true);
  });

  it("allows up to 4 exclamation marks", () => {
    const violations = checkHardGuardrails(
      "Show tonight! Doors at 8! Come through! Bring a friend!"
    );
    expect(violations.some((v) => v.rule === "exclamation-overuse")).toBe(false);
  });

  it("does not flag clean, direct band-voice content", () => {
    const captions = [
      "Playing Lincoln Hall. Three weeks.",
      "We're at Burlington Bar on the 14th. Come through if you can.",
      "Rehearsal went long. Nobody's complaining.",
      "New stuff is almost ready. Almost.",
    ];
    for (const caption of captions) {
      const violations = checkHardGuardrails(caption);
      expect(violations).toHaveLength(0);
    }
  });
});

describe("checkBandVoiceSeparation", () => {
  it("returns no violations when no other band names appear", () => {
    const violations = checkBandVoiceSeparation(
      "Playing Burlington Bar on Saturday.",
      "Stalemate",
      ["Rad Dad"]
    );
    expect(violations).toHaveLength(0);
  });

  it("flags when another band name appears in caption", () => {
    const violations = checkBandVoiceSeparation(
      "Come see Stalemate and Rad Dad at the same show.",
      "Stalemate",
      ["Rad Dad"]
    );
    expect(violations.some((v) => v.rule === "band-voice-separation")).toBe(true);
  });

  it("does not flag the target band's own name", () => {
    const violations = checkBandVoiceSeparation(
      "Stalemate is playing Burlington Bar on Saturday.",
      "Stalemate",
      ["Rad Dad"]
    );
    expect(violations).toHaveLength(0);
  });
});

describe("checkAutoPublishGuard", () => {
  it("returns violation when auto-publish is true", () => {
    const violations = checkAutoPublishGuard(true);
    expect(violations.some((v) => v.rule === "no-auto-publish")).toBe(true);
  });

  it("returns no violations when auto-publish is false", () => {
    const violations = checkAutoPublishGuard(false);
    expect(violations).toHaveLength(0);
  });
});
