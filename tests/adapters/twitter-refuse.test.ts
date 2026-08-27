/**
 * Leftover after #18: Twitter/X is schema leftover only.
 * The live path must refuse TWITTER fail-closed. No real X adapter.
 * Facebook / Instagram / YouTube still cannot auto-post.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allMockAdapters, refusedTwitterAdapter } from "@/lib/adapters/social/mock-adapter";
import {
  assertCanApproveDraft,
  assertReadyForLivePublish,
  assertSafeToLivePublish,
  TWITTER_SCHEMA_LEFTOVER_REFUSAL,
} from "@/lib/services/publish/safety";

const root = join(__dirname, "../..");

function readRepo(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("TWITTER leftover refuse", () => {
  it("is not the Facebook mock and cannot direct-publish or schedule-publish", () => {
    expect(allMockAdapters.TWITTER).toBe(refusedTwitterAdapter);
    expect(allMockAdapters.TWITTER).not.toBe(allMockAdapters.FACEBOOK);
    expect(allMockAdapters.TWITTER.adapterName).toBe("refused-twitter");
    expect(allMockAdapters.TWITTER.capabilities.canDirectPublish).toBe(false);
    expect(allMockAdapters.TWITTER.capabilities.canSchedule).toBe(false);
  });

  it("does not assign TWITTER to the Facebook mock in source", () => {
    const source = readRepo("lib/adapters/social/mock-adapter.ts");
    expect(source).not.toMatch(/TWITTER\s*[:=]\s*mockFacebookAdapter/);
    expect(source).toMatch(/TWITTER:\s*refusedTwitterAdapter/);
    expect(source).toMatch(/canDirectPublish:\s*false/);
  });

  it("cannot pretend a tweet went out", async () => {
    const result = await allMockAdapters.TWITTER.publish({
      caption: "This must not look like a live tweet.",
      hashtags: [],
    });

    expect(result.success).toBe(false);
    expect(result.isDraftOnly).toBe(true);
    expect(result.externalPostId).toBeUndefined();
    expect(result.externalPostUrl).toBeUndefined();
    expect(result.errorMessage).toMatch(/schema leftover/i);
    expect(result.errorMessage).toMatch(/did not publish a tweet/i);
  });

  it.each(["mock", "real"] as const)(
    "refuses %s-mode TWITTER at the live safety gate",
    (mode) => {
      const safe = assertSafeToLivePublish({
        socialAdapterMode: mode,
        platform: "TWITTER",
        accountIsConnected: true,
        accountIsActive: true,
      });
      expect(safe).toEqual({ ok: false, reason: TWITTER_SCHEMA_LEFTOVER_REFUSAL });

      const ready = assertReadyForLivePublish({
        socialAdapterMode: mode,
        platform: "TWITTER",
        accountIsConnected: true,
        accountIsActive: true,
        mediaUrls: ["https://cdn.example.com/show.jpg"],
      });
      expect(ready).toEqual({ ok: false, reason: TWITTER_SCHEMA_LEFTOVER_REFUSAL });
    }
  );

  it("factory short-circuits TWITTER before mock or real adapters", () => {
    const factory = readRepo("lib/adapters/social/index.ts");
    expect(factory).toMatch(/if \(platform === "TWITTER"\)/);
    expect(factory).toMatch(/return refusedTwitterAdapter/);
    expect(factory).not.toMatch(/allMockAdapters\[platform\].*TWITTER/);
  });

  it("schedule dialog names the leftover refuse, not a real-mode-only warning", () => {
    const client = readRepo("app/(app)/review-queue/client.tsx");
    expect(client).toMatch(/Twitter\/X is schema leftover/);
    expect(client).toMatch(/No tweet will go out/);
    expect(client).not.toMatch(
      /draft\.platform === "TWITTER" \|\s*\n\s*draft\.platform === "TIKTOK"/
    );
  });

  it("factory returns the refuse stub in mock and real", async () => {
    for (const mode of ["mock", "real"] as const) {
      process.env.SOCIAL_ADAPTER = mode;
      jest.resetModules();
      const { getSocialAdapter } = require("@/lib/adapters/social/index") as {
        getSocialAdapter: (platform: string) => Promise<{
          adapterName: string;
          capabilities: { canDirectPublish: boolean };
          publish: (payload: { caption: string; hashtags: string[] }) => Promise<{
            success: boolean;
            externalPostId?: string;
            externalPostUrl?: string;
          }>;
        }>;
      };

      const twitter = await getSocialAdapter("TWITTER");
      expect(twitter.adapterName).toBe("refused-twitter");
      expect(twitter.capabilities.canDirectPublish).toBe(false);

      const published = await twitter.publish({
        caption: "Factory leftover must not tweet.",
        hashtags: [],
      });
      expect(published.success).toBe(false);
      expect(published.externalPostId).toBeUndefined();
      expect(published.externalPostUrl).toBeUndefined();
    }

    delete process.env.SOCIAL_ADAPTER;
  });
});

describe("Facebook / Instagram / YouTube review-before-publish cannot auto-post", () => {
  it("generate always creates IN_REVIEW with auto-publish off", () => {
    const generate = readRepo("lib/services/content/generate.ts");
    expect(generate).toMatch(/isAutoPublish:\s*false/);
    expect(generate).toMatch(/status:\s*"IN_REVIEW"/);
    expect(generate).toMatch(/never auto-publish/);
  });

  it("Approve is Jeff's yes to schedule, not a live post", () => {
    expect(assertCanApproveDraft({ status: "IN_REVIEW", riskLevel: "LOW" })).toEqual({
      ok: true,
    });
    expect(assertCanApproveDraft({ status: "PUBLISHED", riskLevel: "LOW" }).ok).toBe(false);
    expect(assertCanApproveDraft({ status: "SCHEDULED", riskLevel: "LOW" }).ok).toBe(false);
  });

  it("real Facebook still needs a connected active account", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "FACEBOOK",
      accountIsConnected: false,
      accountIsActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not connected/i);
    }
  });

  it("real Instagram still cannot auto-post a caption-only draft", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "INSTAGRAM",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/https/i);
    }
  });

  it("real YouTube still cannot auto-post a text caption", () => {
    const result = assertReadyForLivePublish({
      socialAdapterMode: "real",
      platform: "YOUTUBE",
      accountIsConnected: true,
      accountIsActive: true,
      mediaUrls: [],
      accountMetadata: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/YouTube/i);
    }
  });
});
