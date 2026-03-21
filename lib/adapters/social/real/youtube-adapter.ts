/**
 * Real YouTube adapter — prepares and surfaces community-post content for YouTube channels.
 *
 * Required env vars:
 *   YOUTUBE_CLIENT_ID      — OAuth 2.0 client ID
 *   YOUTUBE_CLIENT_SECRET  — OAuth 2.0 client secret
 *   YOUTUBE_REFRESH_TOKEN  — Offline refresh token (obtained via consent flow)
 *
 * Optional in PlatformAccount.metadata: { "channelId": "UC..." }
 *
 * API REALITY NOTE:
 * The YouTube Data API v3 removed community post creation (communityPosts.insert) in 2023.
 * Direct text post creation is not available via the public API.
 *
 * What this adapter does:
 *   1. Validates credentials by fetching the authenticated channel info.
 *   2. Returns isDraftOnly=true with the content prepped for manual posting.
 *      The operator can copy the caption into YouTube Studio → Community tab.
 *
 * This is the honest capability declaration for YouTube text posts.
 * When a video URL is provided, this adapter can update video metadata (title/description).
 *
 * Docs: https://developers.facebook.com/docs/youtube/data/v3
 * Permission required: https://www.googleapis.com/auth/youtube
 */

import type { Platform } from "@prisma/client";
import {
  SocialProviderAdapter,
  type PublishPayload,
  type PublishResult,
  type SocialAdapterCapabilities,
} from "../base";
import { getYouTubeCredentials, hasYouTubeCredentials } from "./credentials";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export class YouTubeRealAdapter extends SocialProviderAdapter {
  readonly platform: Platform = "YOUTUBE";
  readonly adapterName = "real-youtube";

  readonly capabilities: SocialAdapterCapabilities = {
    // Community post API removed. Text posts must be done manually in YouTube Studio.
    canDirectPublish: false,
    canSchedule: false,
    canDraftOnly: true,
    canDeletePost: false,
    supportsMedia: true,     // Video metadata/description updates are supported
    supportsHashtags: true,
    maxCaptionLength: 5000,
    maxHashtags: 15,
  };

  /**
   * Exchange the refresh token for a short-lived access token.
   */
  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = getYouTubeCredentials();

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as Record<string, unknown>;
      throw new Error(
        `YouTube OAuth token refresh failed: ${(err.error_description as string) ?? response.status}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return data.access_token as string;
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const start = Date.now();

    // If a video URL or YouTube video ID is provided in mediaUrls, attempt to update
    // the video description (the one real write action available to us).
    const videoId = this.extractYouTubeVideoId(payload.mediaUrls);

    if (videoId) {
      return this.updateVideoDescription(videoId, payload, start);
    }

    // No video — YouTube has no text post API. Surface content for manual posting.
    // isDraftOnly=true tells the worker to keep the draft in APPROVED, not mark PUBLISHED.
    return {
      success: true,
      isDraftOnly: true,
      responseCode: undefined,
      externalPostId: undefined,
      externalPostUrl: "https://studio.youtube.com/channel/content/community",
      durationMs: Date.now() - start,
    };
  }

  /**
   * Update a YouTube video's description with the caption content.
   * This is the one reliable write path available via the Data API v3.
   */
  private async updateVideoDescription(
    videoId: string,
    payload: PublishPayload,
    start: number
  ): Promise<PublishResult> {
    try {
      const accessToken = await this.getAccessToken();

      // Fetch current video snippet to preserve title and other fields
      const getResponse = await fetch(
        `${YT_API_BASE}/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!getResponse.ok) {
        return {
          success: false,
          isDraftOnly: false,
          errorMessage: `Could not fetch YouTube video ${videoId}: ${getResponse.status}`,
          responseCode: getResponse.status,
          durationMs: Date.now() - start,
        };
      }

      const getData = (await getResponse.json()) as Record<string, unknown>;
      const items = getData.items as Array<Record<string, unknown>> | undefined;
      if (!items || items.length === 0) {
        return {
          success: false,
          isDraftOnly: false,
          errorMessage: `YouTube video ${videoId} not found or not accessible.`,
          durationMs: Date.now() - start,
        };
      }

      const snippet = items[0].snippet as Record<string, unknown>;
      // Max YouTube description length is 5000 characters.
      const MAX_DESCRIPTION_LENGTH = 5000;
      let description = payload.caption;

      if (payload.hashtags.length > 0) {
        const hashtagBlock = `\n\n${payload.hashtags.join(" ")}`;
        if (description.length + hashtagBlock.length > MAX_DESCRIPTION_LENGTH) {
          // Truncate caption if needed to fit hashtags
          description = description.substring(0, MAX_DESCRIPTION_LENGTH - hashtagBlock.length);
        }
        description += hashtagBlock;
      }

      // Ensure total length is within limits as a final safeguard
      description = description.substring(0, MAX_DESCRIPTION_LENGTH);


      // Update only the description; preserve categoryId, title, etc.
      const updateResponse = await fetch(`${YT_API_BASE}/videos?part=snippet`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: videoId,
          snippet: {
            ...snippet,
            description,
          },
        }),
      });

      if (!updateResponse.ok) {
        const errData = (await updateResponse.json()) as Record<string, unknown>;
        const ytErr = (errData.error as Record<string, unknown> | undefined)?.message;
        return {
          success: false,
          isDraftOnly: false,
          errorMessage: (ytErr as string) ?? `YouTube update failed: ${updateResponse.status}`,
          responseCode: updateResponse.status,
          durationMs: Date.now() - start,
        };
      }

      return {
        success: true,
        isDraftOnly: false,
        externalPostId: videoId,
        externalPostUrl: `https://www.youtube.com/watch?v=${videoId}`,
        responseCode: 200,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: err instanceof Error ? err.message : "Unknown YouTube error",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Extract a YouTube video ID from mediaUrls if one looks like a YouTube URL or bare ID.
   * Returns null if none found — indicating this is a text post (no direct publish path).
   */
  private extractYouTubeVideoId(mediaUrls?: string[]): string | null {
    if (!mediaUrls || mediaUrls.length === 0) return null;

    for (const url of mediaUrls) {
      // Match youtube.com/watch?v=ID or youtu.be/ID or bare 11-char ID
      const match =
        url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ??
        url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ??
        (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url) ? [null, url] : null);

      if (match) return match[1];
    }

    return null;
  }

  async deletePost(_externalPostId: string): Promise<boolean> {
    // YouTube video deletion is intentionally not implemented — too destructive.
    // Operators should manage video lifecycle in YouTube Studio.
    console.warn("[YouTubeAdapter] deletePost is not supported. Manage videos in YouTube Studio.");
    return false;
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasYouTubeCredentials()) return false;

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        `${YT_API_BASE}/channels?part=id,snippet&mine=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) return false;
      const data = (await response.json()) as Record<string, unknown>;
      const items = data.items as unknown[] | undefined;
      return Array.isArray(items) && items.length > 0;
    } catch {
      return false;
    }
  }
}
