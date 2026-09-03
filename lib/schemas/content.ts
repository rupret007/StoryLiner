import { z } from "zod";

/** Generate only creates live-destination drafts. Schema leftovers stay leftover. */
export const LIVE_GENERATE_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "YOUTUBE"] as const;

export const generateContentSchema = z.object({
  bandId: z.string().cuid(),
  campaignType: z.enum([
    "SHOW_ANNOUNCEMENT", "REMINDER", "DAY_OF_SHOW", "LAST_CALL",
    "THANK_YOU", "RECAP", "REHEARSAL", "BEHIND_THE_SCENES",
    "RELEASE_TEASER", "RELEASE_DAY", "MERCH_PUSH", "CROWD_ENGAGEMENT",
    "FAN_QUESTION", "MILESTONE", "LIVESTREAM_ANNOUNCEMENT",
    "LIVESTREAM_REMINDER", "GOING_LIVE_NOW", "POST_STREAM_THANK_YOU",
    "POST_STREAM_RECAP", "CLIP_PROMOTION",
  ]),
  platform: z.enum(LIVE_GENERATE_PLATFORMS),
  contentLength: z.enum(["SHORT", "MEDIUM", "LONG"]).default("MEDIUM"),
  toneVariant: z.enum([
    "AUTHENTIC", "ENERGETIC", "NOSTALGIC", "FUNNY", "RAW",
    "HYPE", "GRATEFUL", "MYSTERIOUS", "DIRECT",
  ]).optional(),
  context: z.object({
    eventDetails: z.string().max(500).optional(),
    showDate: z.string().optional(),
    venue: z.string().optional(),
    city: z.string().optional(),
    ticketUrl: z.string().url().optional().or(z.literal("")),
    additionalContext: z.string().max(500).optional(),
  }).optional(),
  campaignId: z.string().cuid().optional(),
  eventId: z.string().cuid().optional(),
  mediaUrls: z.array(z.string().max(2000)).max(5).optional(),
});

export const reviewSnapshotReceiptSchema = z.object({
  updatedAt: z.string().min(1).max(64),
  fingerprint: z.string().min(1).max(20000),
});

export const attachDraftMediaSchema = z.object({
  draftId: z.string().cuid(),
  mediaUrls: z.array(z.string().max(2000)).max(5),
  reviewedSnapshot: reviewSnapshotReceiptSchema,
});

export const rewriteDraftSchema = z.object({
  draftId: z.string().cuid(),
  directive: z.enum([
    "funnier",
    "lessCheesy",
    "morePunk",
    "cleaner",
    "moreHuman",
    "moreConcise",
    "moreUrgency",
    "moreAuthentic",
    "shorterHashtags",
    "noHashtags",
    "addCTA",
  ]),
  additionalInstructions: z.string().max(200).optional(),
  reviewedSnapshot: reviewSnapshotReceiptSchema,
});

export const reviewDraftSchema = z.object({
  draftId: z.string().cuid(),
  action: z.enum(["approve", "hold", "deny", "reject", "archive", "resume"]),
  notes: z.string().max(500).optional(),
  rejectedReason: z.string().max(500).optional(),
});

export const scheduleDraftSchema = z.object({
  draftId: z.string().cuid(),
  platformAccountId: z.string().cuid(),
  scheduledFor: z.string().datetime(),
  reviewedSnapshot: reviewSnapshotReceiptSchema,
  confirmCheckedNoLivePost: z.boolean().optional(),
});

export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type AttachDraftMediaInput = z.infer<typeof attachDraftMediaSchema>;
export type RewriteDraftInput = z.infer<typeof rewriteDraftSchema>;
export type ReviewDraftInput = z.infer<typeof reviewDraftSchema>;
export type ScheduleDraftInput = z.infer<typeof scheduleDraftSchema>;
