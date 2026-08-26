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
 * If no public https mediaUrls are provided, this adapter fails closed (success=false,
 * isDraftOnly=true). The worker will not mark the post published.
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
import { sanitizeMediaUrls } from "@/lib/services/publish/safety";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";
const UNCERTAIN_PUBLISH_SUFFIX =
  "StoryLiner did not mark this published. Check Instagram before scheduling again.";

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

    // Instagram requires at least one public https media item for Feed posts.
    // Fail closed — do not report success or let the worker mark this published.
    const mediaUrls = sanitizeMediaUrls(payload.mediaUrls);
    if (mediaUrls.length === 0) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage:
          "Instagram feed posts require a public https image or video URL. Nothing was published.",
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

      const mediaUrl = mediaUrls[0];
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

      const creationId =
        typeof containerData.id === "string" ? containerData.id.trim() : "";
      if (!creationId) {
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            `Instagram media container was created without an id. ${UNCERTAIN_PUBLISH_SUFFIX}`,
          responseCode: containerResponse.status,
          durationMs: Date.now() - start,
        };
      }

      // Video containers must be FINISHED before media_publish. Do not fire
      // publish against IN_PROGRESS / ERROR / EXPIRED — that is not a live post.
      if (isVideo) {
        const notReady = await this.refuseUnreadyVideoContainer(
          creationId,
          userAccessToken,
          start
        );
        if (notReady) return notReady;
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

      const postId = typeof publishData.id === "string" ? publishData.id.trim() : "";
      if (!postId) {
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            `Instagram publish returned success without a post id. ${UNCERTAIN_PUBLISH_SUFFIX}`,
          responseCode: publishResponse.status,
          durationMs: Date.now() - start,
        };
      }

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
   * Fail closed unless the container is FINISHED or already PUBLISHED.
   * IN_PROGRESS / ERROR / EXPIRED / missing status never call media_publish.
   */
  private async refuseUnreadyVideoContainer(
    creationId: string,
    accessToken: string,
    start: number
  ): Promise<PublishResult | null> {
    const status = await this.readContainerStatus(creationId, accessToken);
    if (status === "FINISHED" || status === "PUBLISHED") return null;

    if (status === "IN_PROGRESS") {
      const waitMs = process.env.JEST_WORKER_ID ? 0 : 5000;
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      const afterWait = await this.readContainerStatus(creationId, accessToken);
      if (afterWait === "FINISHED" || afterWait === "PUBLISHED") return null;
      return {
        success: false,
        isDraftOnly: false,
        errorMessage:
          `Instagram video container is still processing. ${UNCERTAIN_PUBLISH_SUFFIX}`,
        durationMs: Date.now() - start,
      };
    }

    return {
      success: false,
      isDraftOnly: false,
      errorMessage:
        status === "ERROR" || status === "EXPIRED"
          ? `Instagram video container ${status.toLowerCase()}. ${UNCERTAIN_PUBLISH_SUFFIX}`
          : `Instagram video container is not ready. ${UNCERTAIN_PUBLISH_SUFFIX}`,
      durationMs: Date.now() - start,
    };
  }

  private async readContainerStatus(
    creationId: string,
    accessToken: string
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `${GRAPH_API_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
      );
      if (!response.ok) return null;
      const data = (await response.json()) as Record<string, unknown>;
      return typeof data.status_code === "string" ? data.status_code : null;
    } catch {
      return null;
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
