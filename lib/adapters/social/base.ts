import type { Platform } from "@prisma/client";

export interface PublishPayload {
  caption: string;
  hashtags: string[];
  mediaUrls?: string[];
  scheduledFor?: Date;
  /**
   * Platform-account-specific metadata passed from PlatformAccount.metadata.
   * Real adapters use this for account IDs (e.g. pageId, instagramUserId, channelId)
   * so they can post to the correct account without hardcoding.
   */
  accountMetadata?: Record<string, unknown>;
}

export interface PublishResult {
  success: boolean;
  /**
   * True when the adapter can only save to the platform's internal draft queue.
   * The content is NOT live and requires manual publish from the platform.
   */
  isDraftOnly?: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  errorMessage?: string;
  responseCode?: number;
  durationMs: number;
}

export interface SocialAdapterCapabilities {
  canDirectPublish: boolean;    // Can publish immediately
  canSchedule: boolean;         // Can schedule for later natively
  canDraftOnly: boolean;        // Can only save as draft (e.g. TikTok)
  canDeletePost: boolean;
  supportsMedia: boolean;
  supportsHashtags: boolean;
  maxCaptionLength: number;
  maxHashtags: number;
}

export abstract class SocialProviderAdapter {
  abstract readonly platform: Platform;
  abstract readonly capabilities: SocialAdapterCapabilities;
  abstract readonly adapterName: string;

  abstract publish(payload: PublishPayload): Promise<PublishResult>;
  abstract deletePost(externalPostId: string): Promise<boolean>;
  abstract validateCredentials(): Promise<boolean>;

  /**
   * Degrade gracefully when capabilities don't match the requested action.
   * Returns a warning message or null if the action is supported.
   */
  getDegradationWarning(action: "publish" | "schedule" | "delete"): string | null {
    if (action === "publish" && !this.capabilities.canDirectPublish) {
      if (this.capabilities.canDraftOnly) {
        return `${this.platform} adapter can only save as draft. Manual publish required.`;
      }
      return `${this.platform} direct publishing not supported by this adapter.`;
    }
    if (action === "schedule" && !this.capabilities.canSchedule) {
      return `${this.platform} native scheduling not supported. StoryLiner will handle scheduling via job queue.`;
    }
    return null;
  }
}
