/**
 * Real Facebook Page adapter — posts to a Facebook Page feed via Meta Graph API.
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ACCESS_TOKEN — long-lived Page Access Token
 *   FACEBOOK_PAGE_ID           — numeric Page ID (fallback if not in accountMetadata)
 *
 * Or store per-account in PlatformAccount.metadata: { "pageId": "..." }
 *
 * Docs: https://developers.facebook.com/docs/pages/managing#publishing
 * Permission required: pages_manage_posts
 */

import type { Platform } from "@prisma/client";
import {
  SocialProviderAdapter,
  type PublishPayload,
  type PublishResult,
  type SocialAdapterCapabilities,
} from "../base";
import { getFacebookCredentials, hasFacebookCredentials } from "./credentials";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export class FacebookRealAdapter extends SocialProviderAdapter {
  readonly platform: Platform = "FACEBOOK";
  readonly adapterName = "real-facebook";

  readonly capabilities: SocialAdapterCapabilities = {
    canDirectPublish: true,
    canSchedule: true,    // Facebook Page API supports scheduled posts (published=false + scheduled_publish_time)
    canDraftOnly: false,
    canDeletePost: true,
    supportsMedia: true,
    supportsHashtags: true,
    maxCaptionLength: 63206,
    maxHashtags: 30,
  };

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const start = Date.now();

    try {
      const { pageAccessToken, pageId } = getFacebookCredentials(payload.accountMetadata);

      const message = payload.hashtags.length
        ? `${payload.caption}\n\n${payload.hashtags.join(" ")}`
        : payload.caption;

      const body: Record<string, unknown> = { message };

      // Use Facebook's native scheduled publish if scheduledFor is set and in the future.
      // Scheduled posts require a minimum of 10 minutes and maximum of 6 months.
      if (payload.scheduledFor && payload.scheduledFor > new Date()) {
        body.scheduled_publish_time = Math.floor(payload.scheduledFor.getTime() / 1000);
        body.published = false;
      }

      const response = await fetch(`${GRAPH_API_BASE}/${pageId}/feed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response) {
        throw new Error("No response from Facebook API");
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const fbError = data.error as Record<string, unknown> | undefined;
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            (fbError?.message as string) ??
            `Facebook Graph API error ${response.status}`,
          responseCode: response.status,
          durationMs: Date.now() - start,
        };
      }

      const postId = data.id as string;
      // Facebook post IDs are in the form {page-id}_{post-id}
      const [, shortId] = postId.includes("_") ? postId.split("_") : ["", postId];
      const externalPostUrl = `https://www.facebook.com/permalink.php?story_fbid=${shortId}&id=${pageId}`;

      return {
        success: true,
        isDraftOnly: false,
        externalPostId: postId,
        externalPostUrl,
        responseCode: 200,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error posting to Facebook",
        durationMs: Date.now() - start,
      };
    }
  }

  async deletePost(externalPostId: string): Promise<boolean> {
    try {
      const { pageAccessToken } = getFacebookCredentials();
      const response = await fetch(`${GRAPH_API_BASE}/${externalPostId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${pageAccessToken}` },
      });
      return response && response.ok;
    } catch {
      return false;
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasFacebookCredentials()) return false;

    try {
      const { pageAccessToken, pageId } = getFacebookCredentials();
      // Lightweight read — just verify the token and page access are valid
      const response = await fetch(
        `${GRAPH_API_BASE}/${pageId}?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`
      );
      if (!response.ok) return false;
      const data = (await response.json()) as Record<string, unknown>;
      return typeof data.id === "string";
    } catch {
      return false;
    }
  }
}
