import { z } from "zod";

export const createBandSchema = z.object({
  name: z.string().min(1, "Band name is required").max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().max(500).optional(),
  genre: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  founded: z.string().max(20).optional(),
  coverColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1a1a2e"),
});

export const updateBandSchema = createBandSchema.partial();

export const bandVoiceProfileSchema = z.object({
  toneDescription: z.string().min(10, "Describe the band's voice").max(1000),
  personalityTraits: z.array(z.string()).min(1).max(10),
  audienceNotes: z.string().max(1000),
  postingGoals: z.array(z.string()).max(10),
  toneRules: z.array(z.string()).max(20),
  bannedPhrases: z.array(z.string()).max(50),
  bannedTopics: z.array(z.string()).max(20),
  defaultTone: z.enum([
    "AUTHENTIC", "ENERGETIC", "NOSTALGIC", "FUNNY", "RAW",
    "HYPE", "GRATEFUL", "MYSTERIOUS", "DIRECT",
  ]),
  humorLevel: z.number().int().min(1).max(10),
  edgeLevel: z.number().int().min(1).max(10),
  emojiTolerance: z.number().int().min(1).max(10),
  isExplicitOk: z.boolean(),
  preferredLengths: z.array(z.enum(["SHORT", "MEDIUM", "LONG"])),
  facebookNotes: z.string().max(500).optional(),
  instagramNotes: z.string().max(500).optional(),
  blueskyNotes: z.string().max(500).optional(),
  tiktokNotes: z.string().max(500).optional(),
  youtubeNotes: z.string().max(500).optional(),
  twitchNotes: z.string().max(500).optional(),
  goodExamples: z.array(z.string()).max(10),
  badExamples: z.array(z.string()).max(10),
});

export type CreateBandInput = z.infer<typeof createBandSchema>;
export type UpdateBandInput = z.infer<typeof updateBandSchema>;
export type BandVoiceProfileInput = z.infer<typeof bandVoiceProfileSchema>;
