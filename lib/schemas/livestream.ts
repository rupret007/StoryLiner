import { z } from "zod";

export const createLivestreamSchema = z.object({
  bandId: z.string().cuid(),
  title: z.string().min(1).max(150),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().datetime(),
  pinnedComment: z.string().max(500).optional(),
  ctaText: z.string().max(200).optional(),
  guestNotes: z.string().max(1000).optional(),
  sceneNotes: z.string().max(1000).optional(),
  gearChecklist: z.array(z.string()).max(30),
  obsNotes: z.string().max(1000).optional(),
  clipIdeas: z.array(z.string()).max(20),
  highlightIdeas: z.array(z.string()).max(20),
});

export const createRunOfShowItemSchema = z.object({
  livestreamEventId: z.string().cuid(),
  order: z.number().int().min(0),
  title: z.string().min(1).max(150),
  duration: z.number().int().min(1).max(480).optional(),
  notes: z.string().max(1000).optional(),
  banterPrompts: z.array(z.string()).max(10),
  engagementPrompts: z.array(z.string()).max(10),
});

export const createLivestreamDestinationSchema = z.object({
  livestreamEventId: z.string().cuid(),
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "BLUESKY", "TIKTOK", "YOUTUBE", "TWITCH", "TWITTER"]),
  streamTitle: z.string().max(150).optional(),
  streamKey: z.string().max(200).optional(),
  rtmpUrl: z.string().max(200).optional(),
  isEnabled: z.boolean().default(true),
});

export type CreateLivestreamInput = z.infer<typeof createLivestreamSchema>;
export type CreateRunOfShowItemInput = z.infer<typeof createRunOfShowItemSchema>;
export type CreateLivestreamDestinationInput = z.infer<typeof createLivestreamDestinationSchema>;
