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

      expect(rewritten).toContain("Link in bio");
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
