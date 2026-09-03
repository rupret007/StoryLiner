import {
  bandSlugBase,
  nextAvailableBandSlug,
  parseBandSetupForm,
  splitBandSetupList,
} from "@/lib/services/bands/setup";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("band setup", () => {
  it("parses one compact setup without inventing optional facts", () => {
    const form = new FormData();
    form.set("name", " The Fault Lines ");
    form.set("toneDescription", "Warm, direct, and a little scrappy.");
    form.set("personalityTraits", "warm, direct");

    expect(parseBandSetupForm(form)).toMatchObject({
      name: "The Fault Lines",
      toneDescription: "Warm, direct, and a little scrappy.",
      personalityTraits: "warm, direct",
      coverColor: "#6d28d9",
    });
    expect(parseBandSetupForm(form).genre).toBeUndefined();
  });

  it("refuses an empty voice boundary", () => {
    const form = new FormData();
    form.set("name", "Band");
    form.set("toneDescription", "too short");
    form.set("personalityTraits", "");

    expect(() => parseBandSetupForm(form)).toThrow();
  });

  it("normalizes safe slugs and has an honest fallback", () => {
    expect(bandSlugBase("Mötley & Friends!!!")).toBe("motley-friends");
    expect(bandSlugBase("🎸")).toBe("band");
  });

  it("deduplicates comma-separated facts without changing their order", () => {
    expect(splitBandSetupList("warm, direct, warm, funny")).toEqual([
      "warm",
      "direct",
      "funny",
    ]);
    expect(splitBandSetupList(undefined)).toEqual([]);
  });

  it("limits the first-pass voice boundary to ten traits", () => {
    const form = new FormData();
    form.set("name", "Band");
    form.set("toneDescription", "A voice description with enough detail.");
    form.set(
      "personalityTraits",
      "one,two,three,four,five,six,seven,eight,nine,ten,eleven"
    );

    expect(() => parseBandSetupForm(form)).toThrow(/no more than 10/i);
  });

  it("finds the first available URL without overwriting another band", async () => {
    const taken = new Set(["rad-dad", "rad-dad-2"]);
    await expect(
      nextAvailableBandSlug("Rad Dad", async (slug) => taken.has(slug))
    ).resolves.toBe("rad-dad-3");
  });

  it("keeps the setup route transactional and explicitly non-publishing", () => {
    const actionSource = readFileSync(
      join(__dirname, "../../app/(app)/bands/new/actions.ts"),
      "utf8"
    );
    const formSource = readFileSync(
      join(__dirname, "../../app/(app)/bands/new/form.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/prisma\.\$transaction/);
    expect(actionSource).toMatch(/voiceProfile:\s*\{\s*create:/);
    expect(formSource).toMatch(/does not connect accounts, schedule, or publish/i);
  });
});
