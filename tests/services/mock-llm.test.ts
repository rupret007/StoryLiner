import { MockLlmAdapter } from "@/lib/services/llm/mock-adapter";
import type { Band, BandVoiceProfile } from "@prisma/client";

const mockStalemate = {
  id: "band_stalemate_01",
  name: "Stalemate",
  slug: "stalemate",
  userId: "user_01",
  description: null,
  genre: null,
  location: null,
  founded: null,
  coverColor: "#5b21b6",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  voiceProfile: {
    id: "vp_stalemate_01",
    bandId: "band_stalemate_01",
    toneDescription: "Dry, direct, honest",
    personalityTraits: ["dry wit", "anti-hype"],
    audienceNotes: "Scene regulars",
    postingGoals: [],
    toneRules: ["No exclamation marks unless unavoidable"],
    bannedPhrases: ["excited to announce", "don't miss out"],
    bannedTopics: [],
    defaultTone: "AUTHENTIC" as const,
    humorLevel: 6,
    edgeLevel: 7,
    emojiTolerance: 2,
    isExplicitOk: false,
    preferredLengths: ["SHORT", "MEDIUM"] as ("SHORT" | "MEDIUM" | "LONG")[],
    facebookNotes: null,
    instagramNotes: null,
    blueskyNotes: null,
    tiktokNotes: null,
    youtubeNotes: null,
    twitchNotes: null,
    goodExamples: [],
    badExamples: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as BandVoiceProfile,
} as Band & { voiceProfile: BandVoiceProfile };

const mockRadDad = {
  ...mockStalemate,
  id: "band_raddad_01",
  name: "Rad Dad",
  slug: "rad-dad",
  coverColor: "#b91c1c",
  voiceProfile: {
    ...mockStalemate.voiceProfile,
    id: "vp_raddad_01",
    bandId: "band_raddad_01",
    toneDescription: "Energetic, nostalgic, crowd-focused",
    defaultTone: "ENERGETIC" as const,
    emojiTolerance: 5,
    humorLevel: 8,
  } as BandVoiceProfile,
} as Band & { voiceProfile: BandVoiceProfile };

const mockFaultLines = {
  ...mockStalemate,
  id: "band_faultlines_01",
  name: "Fault Lines",
  slug: "fault-lines",
  coverColor: "#0f766e",
  voiceProfile: {
    ...mockStalemate.voiceProfile,
    id: "vp_faultlines_01",
    bandId: "band_faultlines_01",
    toneDescription: "Canon-pending and context-led; confirmed facts only",
    personalityTraits: ["context-led", "concise", "canon-pending"],
    toneRules: ["Use only supplied facts"],
    bannedPhrases: ["award-winning"],
    defaultTone: "AUTHENTIC" as const,
    emojiTolerance: 1,
    humorLevel: 3,
    edgeLevel: 3,
  } as BandVoiceProfile,
} as Band & { voiceProfile: BandVoiceProfile };

describe("MockLlmAdapter", () => {
  const adapter = new MockLlmAdapter();

  describe("generateContent", () => {
    it("returns a valid GeneratedContent object for Stalemate", async () => {
      const result = await adapter.generateContent({
        band: mockStalemate,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "INSTAGRAM",
        contentLength: "SHORT",
      });

      expect(result.caption).toBeTruthy();
      expect(result.caption.length).toBeGreaterThan(0);
      expect(Array.isArray(result.hashtags)).toBe(true);
      expect(result.brandFitScore).toBeGreaterThanOrEqual(60);
      expect(result.brandFitScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.fanReplies)).toBe(true);
    });

    it("never invents a Trailer Swift voice", async () => {
      const stalemate = await adapter.generateContent({
        band: mockStalemate,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "INSTAGRAM",
        contentLength: "MEDIUM",
      });
      const radDad = await adapter.generateContent({
        band: mockRadDad,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "FACEBOOK",
        contentLength: "MEDIUM",
      });
      expect(stalemate.caption).not.toMatch(/trailer\s*swift/i);
      expect(radDad.caption).not.toMatch(/trailer\s*swift/i);
    });

    it("does not use FOMO ticket CTAs that conflict with Stalemate voice locks", async () => {
      const result = await adapter.generateContent({
        band: mockStalemate,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "INSTAGRAM",
        contentLength: "MEDIUM",
        context: { ticketUrl: "https://example.com/tickets" },
      });

      expect(result.ctaText).not.toMatch(/before they're gone/i);
      expect(result.ctaText).not.toMatch(/grab your tickets now/i);
      expect(result.caption).not.toMatch(/grab a ticket/i);
      expect(result.fanReplies.join(" ")).not.toMatch(/excited/i);
    });

    it("does not give an unknown band Stalemate or Rad Dad pool copy", async () => {
      const result = await adapter.generateContent({
        band: { ...mockStalemate, name: "Unknown Cover Band", slug: "unknown" },
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "FACEBOOK",
        contentLength: "SHORT",
        context: { venue: "Lincoln Hall", showDate: "Saturday" },
      });

      expect(result.caption).not.toMatch(/Basket Case/i);
      expect(result.caption).not.toMatch(/tuning too slow/i);
      expect(result.caption).not.toMatch(/we won't beg/i);
    });

    it("returns a valid GeneratedContent object for Rad Dad", async () => {
      const result = await adapter.generateContent({
        band: mockRadDad,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "FACEBOOK",
        contentLength: "MEDIUM",
        context: {
          venue: "Lincoln Hall",
          city: "Chicago",
          showDate: "Saturday",
        },
      });

      expect(result.caption).toBeTruthy();
      expect(result.hashtags.length).toBeGreaterThan(0);
    });

    it("gives Fault Lines its neutral canon-pending pool", async () => {
      const result = await adapter.generateContent({
        band: mockFaultLines,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "INSTAGRAM",
        contentLength: "MEDIUM",
        context: {
          venue: "Confirmed Venue",
          showDate: "Confirmed Date",
          ticketUrl: "https://example.com/confirmed",
        },
      });

      expect(result.caption).toContain("Fault Lines");
      expect(result.caption).toContain("Confirmed Venue");
      expect(result.caption).not.toMatch(/Basket Case|pop punk|tuning too slow/i);
      expect(result.hashtags).toContain("#faultlines");
      expect(result.hashtags).toHaveLength(3);
      expect(result.altText).toMatch(/add a factual image description/i);
      expect(result.imagePrompt).toMatch(/do not invent lineup/i);
    });

    it("generates different content for Stalemate vs Rad Dad", async () => {
      const stalemateResult = await adapter.generateContent({
        band: mockStalemate,
        campaignType: "RECAP",
        platform: "INSTAGRAM",
        contentLength: "SHORT",
        context: { city: "Chicago" },
      });

      const radDadResult = await adapter.generateContent({
        band: mockRadDad,
        campaignType: "RECAP",
        platform: "INSTAGRAM",
        contentLength: "SHORT",
        context: { city: "Chicago" },
      });

      // Content pools are different — they should differ
      expect(stalemateResult.caption).not.toEqual(radDadResult.caption);
    });

    it("includes ticket URL in caption when provided and length is not SHORT", async () => {
      const result = await adapter.generateContent({
        band: mockRadDad,
        campaignType: "SHOW_ANNOUNCEMENT",
        platform: "FACEBOOK",
        contentLength: "MEDIUM",
        context: {
          ticketUrl: "https://example.com/tickets",
        },
      });

      expect(result.caption).toContain("https://example.com/tickets");
    });
  });

  describe("rewriteContent", () => {
    const originalCaption =
      "Playing Burlington Bar. Come through if you can.";

    it("makes content more concise", async () => {
      const rewritten = await adapter.rewriteContent({
        originalCaption,
        directive: "moreConcise",
        band: mockStalemate,
        platform: "INSTAGRAM",
      });

      expect(rewritten).toBeTruthy();
      expect(rewritten.length).toBeLessThanOrEqual(originalCaption.length + 50);
    });

    it("removes hashtags with noHashtags directive", async () => {
      const captionWithHashtags = "Playing tonight. #chicago #livemusic #indie";
      const rewritten = await adapter.rewriteContent({
        originalCaption: captionWithHashtags,
        directive: "noHashtags",
        band: mockStalemate,
        platform: "INSTAGRAM",
      });

      expect(rewritten).not.toMatch(/#\w+/);
    });

    it("adds CTA with addCTA directive", async () => {
      const rewritten = await adapter.rewriteContent({
        originalCaption,
        directive: "addCTA",
        band: mockStalemate,
        platform: "INSTAGRAM",
      });

      expect(rewritten).toContain("Tickets if you want them");
    });

    it("does not add FOMO urgency to Stalemate rewrites", async () => {
      const rewritten = await adapter.rewriteContent({
        originalCaption,
        directive: "moreUrgency",
        band: mockStalemate,
        platform: "INSTAGRAM",
      });

      expect(rewritten).toContain("If you're coming, come.");
      expect(rewritten).not.toMatch(/don't wait on this/i);
    });

    it("does not borrow Stalemate or Rad Dad copy for Fault Lines rewrites", async () => {
      const rewritten = await adapter.rewriteContent({
        originalCaption: "Fault Lines. Confirmed details below.",
        directive: "morePunk",
        band: mockFaultLines,
        platform: "INSTAGRAM",
      });

      expect(rewritten).toBe("Fault Lines. Confirmed details below.");
      expect(rewritten).not.toMatch(/band tee|fake smiles/i);
    });

    it("reduces exclamations with cleaner directive", async () => {
      const exclamationHeavy =
        "We are so amazing! Come to the show! It will be incredible! Don't miss out!";
      const rewritten = await adapter.rewriteContent({
        originalCaption: exclamationHeavy,
        directive: "cleaner",
        band: mockStalemate,
        platform: "INSTAGRAM",
      });

      const originalExclamations = (exclamationHeavy.match(/!/g) ?? []).length;
      const rewrittenExclamations = (rewritten.match(/!/g) ?? []).length;
      expect(rewrittenExclamations).toBeLessThanOrEqual(originalExclamations);
    });
  });

  describe("assessRisk", () => {
    it("returns LOW risk for clean content", async () => {
      const result = await adapter.assessRisk(
        "Playing Burlington Bar on Saturday. Doors at 8.",
        mockStalemate
      );

      expect(result.riskLevel).toBe("LOW");
      expect(result.flags).toHaveLength(0);
    });

    it("flags banned phrases from the voice profile", async () => {
      const captionWithBannedPhrase =
        "Excited to announce our upcoming show at Burlington Bar!";
      const result = await adapter.assessRisk(captionWithBannedPhrase, mockStalemate);

      expect(result.flags.length).toBeGreaterThan(0);
    });

    it("flags LinkedIn-influencer phrasing", async () => {
      const result = await adapter.assessRisk(
        "Honored to share that we are performing at Burlington Bar this Saturday!",
        mockStalemate
      );

      expect(result.flags.some((f) => f.includes("LinkedIn"))).toBe(true);
    });

    it("returns brandFitScore between 0 and 100", async () => {
      const result = await adapter.assessRisk(
        "Playing Burlington Bar on Saturday.",
        mockStalemate
      );

      expect(result.brandFitScore).toBeGreaterThanOrEqual(0);
      expect(result.brandFitScore).toBeLessThanOrEqual(100);
    });
  });

  describe("generateTalkingPoints", () => {
    it("returns non-empty talking points array", async () => {
      const points = await adapter.generateTalkingPoints({
        livestreamTitle: "Rad Dad Practice Session",
        bandName: "Rad Dad",
        runOfShowItems: ["Warm up", "First 4 songs", "Chat break"],
      });

      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);
      expect(points.every((p) => typeof p === "string")).toBe(true);
    });
  });

  describe("generateEngagementPrompts", () => {
    it("returns engagement prompts for Rad Dad", async () => {
      const prompts = await adapter.generateEngagementPrompts({
        bandName: "Rad Dad",
        platform: "YOUTUBE",
      });

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it("returns engagement prompts for Stalemate", async () => {
      const prompts = await adapter.generateEngagementPrompts({
        bandName: "Stalemate",
        platform: "INSTAGRAM",
      });

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);
    });
  });
});
