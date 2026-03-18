/**
 * Server-only credential loaders for real social provider adapters.
 * All values come from process.env — never exposed to the browser.
 *
 * accountMetadata is sourced from PlatformAccount.metadata (stored in DB per band/account).
 * Env-var fallbacks let you run with a single global account during initial setup.
 */

export interface FacebookCredentials {
  /** Long-lived Page Access Token from Meta for Developers → Page → Page Access Token */
  pageAccessToken: string;
  /** Numeric Page ID. Find it in Page Settings → About, or via Graph API /me/accounts. */
  pageId: string;
}

export interface InstagramCredentials {
  /** User Access Token (same as Facebook Page token for the connected account) */
  userAccessToken: string;
  /** Instagram Business Account numeric ID — get via /me/accounts?fields=instagram_business_account */
  businessAccountId: string;
}

export interface YouTubeCredentials {
  clientId: string;
  clientSecret: string;
  /** Offline refresh token obtained via OAuth 2.0 consent flow */
  refreshToken: string;
}

/**
 * Attempts to load a credential value. Returns null instead of throwing so
 * callers can return false from validateCredentials() gracefully.
 */
function loadEnv(key: string): string | null {
  return process.env[key] ?? null;
}

function requireCredential(key: string, context: string): string {
  const value = loadEnv(key);
  if (!value) {
    throw new Error(
      `[${context}] Missing required credential: ${key}. ` +
        "Set it in .env.local. See .env.example for details."
    );
  }
  return value;
}

export function getFacebookCredentials(
  accountMetadata?: Record<string, unknown>
): FacebookCredentials {
  return {
    pageAccessToken: requireCredential("FACEBOOK_PAGE_ACCESS_TOKEN", "FacebookAdapter"),
    pageId:
      (accountMetadata?.pageId as string | undefined) ??
      requireCredential("FACEBOOK_PAGE_ID", "FacebookAdapter"),
  };
}

export function getInstagramCredentials(
  accountMetadata?: Record<string, unknown>
): InstagramCredentials {
  return {
    userAccessToken: requireCredential("FACEBOOK_PAGE_ACCESS_TOKEN", "InstagramAdapter"),
    businessAccountId:
      (accountMetadata?.instagramUserId as string | undefined) ??
      requireCredential("INSTAGRAM_BUSINESS_ACCOUNT_ID", "InstagramAdapter"),
  };
}

export function getYouTubeCredentials(): YouTubeCredentials {
  return {
    clientId: requireCredential("YOUTUBE_CLIENT_ID", "YouTubeAdapter"),
    clientSecret: requireCredential("YOUTUBE_CLIENT_SECRET", "YouTubeAdapter"),
    refreshToken: requireCredential("YOUTUBE_REFRESH_TOKEN", "YouTubeAdapter"),
  };
}

/** Returns true if all Facebook env vars are present (doesn't validate against API). */
export function hasFacebookCredentials(): boolean {
  return !!(loadEnv("FACEBOOK_PAGE_ACCESS_TOKEN") && loadEnv("FACEBOOK_PAGE_ID"));
}

/** Returns true if all Instagram env vars are present. */
export function hasInstagramCredentials(): boolean {
  return !!(loadEnv("FACEBOOK_PAGE_ACCESS_TOKEN") && loadEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID"));
}

/** Returns true if all YouTube env vars are present. */
export function hasYouTubeCredentials(): boolean {
  return !!(
    loadEnv("YOUTUBE_CLIENT_ID") &&
    loadEnv("YOUTUBE_CLIENT_SECRET") &&
    loadEnv("YOUTUBE_REFRESH_TOKEN")
  );
}
