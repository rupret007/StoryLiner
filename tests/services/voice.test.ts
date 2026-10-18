import { hashtagCapForVoice, resolveStoryLinerVoice } from "@/lib/services/llm/voice";

describe("resolveStoryLinerVoice", () => {
  it("recognizes Stalemate and Rad Dad only", () => {
    expect(resolveStoryLinerVoice("Stalemate")).toBe("stalemate");
    expect(resolveStoryLinerVoice("Rad Dad")).toBe("rad-dad");
    expect(resolveStoryLinerVoice("Unknown Cover Band")).toBe("unknown");
  });

  it("recognizes Fault Lines independently of the established voices", () => {
    expect(resolveStoryLinerVoice("Fault Lines")).toBe("fault-lines");
    expect(resolveStoryLinerVoice("The Faultlines")).toBe("fault-lines");
  });

  it.each(["Fault Line", "Fault Linesmen", "Default Lines", "Trailer Swift", "Unknown Cover Band"])(
    "keeps the unapproved identity %s on the unknown fallback",
    (name) => {
      expect(resolveStoryLinerVoice(name)).toBe("unknown");
    }
  );

  it.each(["Stalemate", "Rad Dad", "Fault Lines"])("recognizes %s without case sensitivity", (name) => {
    expect(resolveStoryLinerVoice(name.toUpperCase())).toBe(resolveStoryLinerVoice(name));
    expect(resolveStoryLinerVoice(name.toLowerCase())).toBe(resolveStoryLinerVoice(name));
  });

  it("does not treat an unknown name as Stalemate", () => {
    expect(resolveStoryLinerVoice("Something Dirty")).toBe("unknown");
  });
});

describe("hashtagCapForVoice", () => {
  it("caps Stalemate Instagram hashtags at two", () => {
    expect(hashtagCapForVoice("stalemate", "INSTAGRAM")).toBe(2);
    expect(hashtagCapForVoice("rad-dad", "INSTAGRAM")).toBe(8);
    expect(hashtagCapForVoice("fault-lines", "INSTAGRAM")).toBe(3);
    expect(hashtagCapForVoice("stalemate", "FACEBOOK")).toBe(4);
  });
});
