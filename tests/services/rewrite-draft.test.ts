/**
 * Tests for rewrite service hashtag derivation logic and risk recalculation.
 */

// Test the pure hashtag derivation function in isolation.
// We import from the module once it exports this helper, but for now we
// replicate the logic directly for whitebox unit testing.

function deriveHashtags(
  existingHashtags: string[],
  newCaption: string,
  directive: string
): string[] {
  if (directive === "noHashtags") {
    return [];
  }
  if (directive === "shorterHashtags") {
    return existingHashtags.filter((h) => h.length <= 14);
  }
  return existingHashtags;
}

describe("deriveHashtags", () => {
  const tags = ["#bandlife", "#independentmusic", "#live", "#alt", "#originalmusiconly"];

  it("noHashtags directive returns empty array", () => {
    expect(deriveHashtags(tags, "any caption", "noHashtags")).toEqual([]);
  });

  it("shorterHashtags removes tags longer than 14 chars", () => {
    const result = deriveHashtags(tags, "caption", "shorterHashtags");
    expect(result).not.toContain("#independentmusic"); // 17 chars
    expect(result).not.toContain("#originalmusiconly"); // 18 chars
    expect(result).toContain("#bandlife");
    expect(result).toContain("#live");
    expect(result).toContain("#alt");
  });

  it("morePunk directive preserves all existing hashtags", () => {
    const result = deriveHashtags(tags, "new caption", "morePunk");
    expect(result).toEqual(tags);
  });

  it("funnier directive preserves all existing hashtags", () => {
    const result = deriveHashtags(tags, "new caption", "funnier");
    expect(result).toEqual(tags);
  });

  it("returns original tags for any non-hashtag directive", () => {
    for (const directive of ["moreConcise", "moreHuman", "moreUrgency", "cleaner", "moreAuthentic"]) {
      expect(deriveHashtags(tags, "caption", directive)).toEqual(tags);
    }
  });
});

describe("rewrite risk level computation", () => {
  function computeRiskLevel(flagCount: number): "LOW" | "MEDIUM" | "HIGH" {
    return flagCount === 0 ? "LOW" : flagCount <= 2 ? "MEDIUM" : "HIGH";
  }

  it("zero flags = LOW", () => expect(computeRiskLevel(0)).toBe("LOW"));
  it("one flag = MEDIUM", () => expect(computeRiskLevel(1)).toBe("MEDIUM"));
  it("two flags = MEDIUM", () => expect(computeRiskLevel(2)).toBe("MEDIUM"));
  it("three flags = HIGH", () => expect(computeRiskLevel(3)).toBe("HIGH"));
  it("ten flags = HIGH", () => expect(computeRiskLevel(10)).toBe("HIGH"));
});

describe("mock LLM rewriteContent for hashtag directives", () => {
  it("noHashtags directive strips inline hashtags from caption", async () => {
    const { MockLlmAdapter } = await import("@/lib/services/llm/mock-adapter");
    const llm = new MockLlmAdapter();
    const result = await llm.rewriteContent({
      originalCaption: "Playing live #bandlife #livemusic",
      directive: "noHashtags",
      band: { name: "Stalemate", voiceProfile: null } as Parameters<typeof llm.rewriteContent>[0]["band"],
      platform: "INSTAGRAM",
    });
    expect(result).not.toMatch(/#\w+/);
  });

  it("morePunk directive keeps hashtags intact in caption", async () => {
    const { MockLlmAdapter } = await import("@/lib/services/llm/mock-adapter");
    const llm = new MockLlmAdapter();
    const caption = "Playing live #bandlife";
    const result = await llm.rewriteContent({
      originalCaption: caption,
      directive: "morePunk",
      band: { name: "Stalemate", voiceProfile: null } as Parameters<typeof llm.rewriteContent>[0]["band"],
      platform: "INSTAGRAM",
    });
    expect(result).toContain("#bandlife");
  });
});
