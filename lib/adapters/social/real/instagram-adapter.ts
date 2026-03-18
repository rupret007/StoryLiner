/**
 * Real Instagram Business adapter — publishes to Instagram via Meta Content Publishing API.
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ACCESS_TOKEN      — User Access Token (connected to Instagram Business Account)
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID   — Instagram Business Account ID (fallback if not in accountMetadata)
 *
 * Or store per-account in PlatformAccount.metadata: { "instagramUserId": "..." }
 *
 * Publishing is a two-step process:
 *   1. Create a media container (returns creation_id)
 *   2. Publish the container (makes it live)
 *
 * IMPORTANT: Instagram requires a media attachment (image or video) for standard Feed posts.
 * If no mediaUrls are provided, this adapter returns isDraftOnly=true with the caption
 * prepared for manual posting. The operator should add media in Instagram natively.
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 * Permission required: instagram_content_publish, pages_read_engagement
 */

import type { Platform } from "@prisma/client";
import {
  SocialProviderAdapter,
  type PublishPayload,
  type PublishResult,
  type SocialAdapterCapabilities,
} from "../base";
import { getInstagramCredentials, hasInstagramCredentials } from "./credentials";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export class InstagramRealAdapter extends SocialProviderAdapter {
  readonly platform: Platform = "INSTAGRAM";
  readonly adapterName = "real-instagram";

  readonly capabilities: SocialAdapterCapabilities = {
    canDirectPublish: true,  // Requires media — see note above
    canSchedule: false,      // Native scheduling not supported via Content Publishing API
    canDraftOnly: false,
    canDeletePost: true,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 2200,
    maxHashtags: 30,
  };

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const start = Date.now();

    // Instagram requires at least one media item for Feed posts.
    // Without media, surface the content for manual posting.
    if (!payload.mediaUrls || payload.mediaUrls.length === 0) {
      return {
        success: true,
        isDraftOnly: true,
        errorMessage: undefined,
        responseCode: undefined,
        externalPostId: undefined,
        externalPostUrl: undefined,
        durationMs: Date.now() - start,
      };
    }

    try {
      const { userAccessToken, businessAccountId } = getInstagramCredentials(
        payload.accountMetadata
      );

      const caption = payload.hashtags.length
        ? `${payload.caption}\n\n${payload.hashtags.join(" ")}`
        : payload.caption;

      const mediaUrl = payload.mediaUrls[0];
      const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(mediaUrl);

      // Step 1: Create media container
      const containerParams: Record<string, unknown> = {
        caption,
        access_token: userAccessToken,
      };

      if (isVideo) {
        containerParams.media_type = "REELS";
        containerParams.video_url = mediaUrl;
        containerParams.share_to_feed = true;
      } else {
        containerParams.image_url = mediaUrl;
      }

      const containerResponse = await fetch(
        `${GRAPH_API_BASE}/${businessAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerParams),
        }
      );

      const containerData = (await containerResponse.json()) as Record<string, unknown>;

      if (!containerResponse.ok) {
        const fbError = containerData.error as Record<string, unknown> | undefined;
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            (fbError?.message as string) ??
            `Instagram media container creation failed: ${containerResponse.status}`,
          responseCode: containerResponse.status,
          durationMs: Date.now() - start,
        };
      }

      const creationId = containerData.id as string;

      // For video containers, we need to wait for processing. For MVP, we poll once.
      // In production, use a webhook or retry loop.
      if (isVideo) {
        await this.waitForVideoProcessing(businessAccountId, creationId, userAccessToken);
      }

      // Step 2: Publish the container
      const publishResponse = await fetch(
        `${GRAPH_API_BASE}/${businessAccountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: userAccessToken,
          }),
        }
      );

      const publishData = (await publishResponse.json()) as Record<string, unknown>;

      if (!publishResponse.ok) {
        const fbError = publishData.error as Record<string, unknown> | undefined;
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            (fbError?.message as string) ??
            `Instagram publish failed: ${publishResponse.status}`,
          responseCode: publishResponse.status,
          durationMs: Date.now() - start,
        };
      }

      const postId = publishData.id as string;
      return {
        success: true,
        isDraftOnly: false,
        externalPostId: postId,
        externalPostUrl: `https://www.instagram.com/p/${postId}/`,
        responseCode: 200,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage:
          err instanceof Error ? err.message : "Unknown error posting to Instagram",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Poll the media container status once to check if video processing is complete.
   * Returns when FINISHED or after a single check (not a full retry loop for MVP).
   */
  private async waitForVideoProcessing(
    igUserId: string,
    creationId: string,
    accessToken: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${GRAPH_API_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
      );
      if (!response.ok) return;
      const data = (await response.json()) as Record<string, unknown>;
      // status_code: EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
      if (data.status_code === "IN_PROGRESS") {
        // In production: implement a poll loop with exponential backoff.
        // For MVP, wait a fixed period and continue (risk of failure for large videos).
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));
      }
    } catch {
      // Non-fatal — proceed to publish attempt
    }
  }

  async deletePost(externalPostId: string): Promise<boolean> {
    try {
      const { userAccessToken } = getInstagramCredentials();
      const response = await fetch(`${GRAPH_API_BASE}/${externalPostId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userAccessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasInstagramCredentials()) return false;

    try {
      const { userAccessToken, businessAccountId } = getInstagramCredentials();
      // Verify the IG business account is accessible
      const response = await fetch(
        `${GRAPH_API_BASE}/${businessAccountId}?fields=id,username&access_token=${encodeURIComponent(userAccessToken)}`
      );
      if (!response.ok) return false;
      const data = (await response.json()) as Record<string, unknown>;
      return typeof data.id === "string";
    } catch {
      return false;
    }
  }
}
