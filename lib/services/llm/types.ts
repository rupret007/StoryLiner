import type { Band, BandVoiceProfile, CampaignType, Platform, ToneVariant, ContentLength } from "@prisma/client";
import type { GenerationContextFacts } from "@/lib/services/content/campaign-context";

export interface GenerateContentOptions {
  band: Band & { voiceProfile: BandVoiceProfile | null };
  campaignType: CampaignType;
  platform: Platform;
  contentLength: ContentLength;
  toneVariant?: ToneVariant;
  context?: GenerationContextFacts;
  /** Set by the server after exact saved-context verification, never by a browser override. */
  contextSource?: "saved-campaign-event";
}

export interface GeneratedContent {
  caption: string;
  hashtags: string[];
  ctaText?: string;
  altText?: string;
  imagePrompt?: string;
  fanReplies: string[];
  brandFitScore: number;
  confidenceNotes: string;
  riskFlags: string[];
}

export interface RewriteOptions {
  originalCaption: string;
  directive: string;
  band: Band & { voiceProfile: BandVoiceProfile | null };
  platform: Platform;
  additionalInstructions?: string;
}

export interface RiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  flags: string[];
  brandFitScore: number;
  confidenceNotes: string;
}

export interface LLMAdapter {
  name: string;
  generateContent(options: GenerateContentOptions): Promise<GeneratedContent>;
  rewriteContent(options: RewriteOptions): Promise<string>;
  assessRisk(caption: string, band: Band & { voiceProfile: BandVoiceProfile | null }): Promise<RiskAssessment>;
  generateTalkingPoints(options: { livestreamTitle: string; bandName: string; runOfShowItems: string[] }): Promise<string[]>;
  generateEngagementPrompts(options: { bandName: string; platform: Platform }): Promise<string[]>;
}
