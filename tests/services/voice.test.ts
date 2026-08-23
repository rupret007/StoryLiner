import { hashtagCapForVoice, resolveStoryLinerVoice } from "@/lib/services/llm/voice";

describe("resolveStoryLinerVoice", () => {
  it("recognizes Stalemate and Rad Dad only", () => {
    expect(resolveStoryLinerVoice("Stalemate")).toBe("stalemate");
    expect(resolveStoryLinerVoice("Rad Dad")).toBe("rad-dad");
    expect(resolveStoryLinerVoice("Unknown Cover Band")).toBe("unknown");
  });

  it("does not treat an unknown name as Stalemate", () => {
    expect(resolveStoryLinerVoice("Something Dirty")).toBe("unknown");
  });
});

describe("hashtagCapForVoice", () => {
  it("caps Stalemate Instagram hashtags at two", () => {
    expect(hashtagCapForVoice("stalemate", "INSTAGRAM")).toBe(2);
    expect(hashtagCapForVoice("rad-dad", "INSTAGRAM")).toBe(8);
    expect(hashtagCapForVoice("stalemate", "FACEBOOK")).toBe(4);
  });
});
