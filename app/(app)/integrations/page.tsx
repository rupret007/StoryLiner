import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { BandChip } from "@/components/storyliner/band-chip";
import { Puzzle, CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

/** Server-side check for whether the env vars for a platform are present. */
function checkCredentials(platform: string): "ready" | "missing" {
  switch (platform) {
    case "FACEBOOK":
      return process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID
        ? "ready"
        : "missing";
    case "INSTAGRAM":
      return process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
        ? "ready"
        : "missing";
    case "YOUTUBE":
      return process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET &&
        process.env.YOUTUBE_REFRESH_TOKEN
        ? "ready"
        : "missing";
    case "BLUESKY":
      return process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD
        ? "ready"
        : "missing";
    case "TIKTOK":
      return process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_ACCESS_TOKEN
        ? "ready"
        : "missing";
    case "TWITCH":
      return process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN
        ? "ready"
        : "missing";
    default:
      return "missing";
  }
}

const SUPPORTED_PLATFORMS = [
  {
    platform: "FACEBOOK",
    label: "Facebook Page",
    capability: "Direct text + media publish via Graph API",
    realAdapterAvailable: true,
    docs: "Meta Graph API — pages_manage_posts permission",
    setupNote: "FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_PAGE_ID",
  },
  {
    platform: "INSTAGRAM",
    label: "Instagram Business",
    capability: "Media publish via Content Publishing API (image/video required)",
    realAdapterAvailable: true,
    docs: "Meta Content Publishing API — instagram_content_publish permission",
    setupNote: "FACEBOOK_PAGE_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID",
  },
  {
    platform: "YOUTUBE",
    label: "YouTube",
    capability: "Video description updates (text posts require manual YouTube Studio)",
    realAdapterAvailable: true,
    docs: "YouTube Data API v3 — OAuth 2.0 offline access",
    setupNote: "YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN",
  },
  {
    platform: "BLUESKY",
    label: "Bluesky",
    capability: "Direct publish via AT Protocol",
    realAdapterAvailable: false,
    docs: "AT Protocol — app password auth",
    setupNote: "BLUESKY_IDENTIFIER + BLUESKY_APP_PASSWORD",
  },
  {
    platform: "TIKTOK",
    label: "TikTok",
    capability: "Draft creation (video required for direct publish)",
    realAdapterAvailable: false,
    docs: "TikTok Content Posting API — video.publish scope",
    setupNote: "TIKTOK_CLIENT_KEY + TIKTOK_ACCESS_TOKEN",
  },
  {
    platform: "TWITCH",
    label: "Twitch",
    capability: "Channel metadata updates via Helix API",
    realAdapterAvailable: false,
    docs: "Twitch Helix API — channel:manage:broadcast scope",
    setupNote: "TWITCH_CLIENT_ID + TWITCH_ACCESS_TOKEN",
  },
];

export default async function IntegrationsPage() {
  const platformAccounts = await prisma.platformAccount.findMany({
    include: { band: true },
  });

  const adapterMode = process.env.SOCIAL_ADAPTER ?? "mock";
  const isRealMode = adapterMode === "real";

  const platformsWithStatus = SUPPORTED_PLATFORMS.map((p) => ({
    ...p,
    credentialStatus: isRealMode ? checkCredentials(p.platform) : ("mock" as const),
    connectedAccounts: platformAccounts.filter((a) => a.platform === p.platform),
  }));

  const readyCount = platformsWithStatus.filter(
    (p) => p.credentialStatus === "ready"
  ).length;

  return (
    <div className="space-y-6">
      {/* Status banner — changes based on adapter mode */}
      {isRealMode ? (
        <Card
          className={
            readyCount > 0 ? "border-emerald-600/30 bg-emerald-950/10" : "border-amber-600/30 bg-amber-600/5"
          }
        >
          <CardContent className="p-4 flex items-start gap-3">
            {readyCount > 0 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                Running in real mode —{" "}
                {readyCount === 0
                  ? "no platform credentials configured yet"
                  : `${readyCount} platform${readyCount !== 1 ? "s" : ""} ready`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {readyCount === 0
                  ? "Add API credentials in .env.local for each platform you want to enable. See the setup notes below."
                  : "Platforms marked Ready have credentials in .env.local. Validate live access using the API docs links."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-600/30 bg-amber-600/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Puzzle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Running in mock mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All social providers are simulated for local development. Set{" "}
                <code className="bg-muted px-1 rounded text-xs">SOCIAL_ADAPTER=real</code> and
                provide API credentials in{" "}
                <code className="bg-muted px-1 rounded text-xs">.env.local</code> to enable live
                publishing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider grid */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Social Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {platformsWithStatus.map((p) => {
            const badgeVariant =
              p.credentialStatus === "ready"
                ? "success"
                : p.credentialStatus === "mock"
                ? "secondary"
                : "warning";

            const badgeLabel =
              p.credentialStatus === "ready"
                ? "Ready"
                : p.credentialStatus === "mock"
                ? "Mock"
                : "Credentials missing";

            return (
              <Card
                key={p.platform}
                className={
                  isRealMode && !p.realAdapterAvailable ? "opacity-60" : ""
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <PlatformIcon platform={p.platform} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-foreground">{p.label}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isRealMode && p.realAdapterAvailable && (
                            <Badge variant="outline" className="text-[10px]">
                              Real adapter
                            </Badge>
                          )}
                          {isRealMode && !p.realAdapterAvailable && (
                            <Badge variant="secondary" className="text-[10px]">
                              Mock fallback
                            </Badge>
                          )}
                          <Badge variant={badgeVariant} className="text-xs">
                            {badgeLabel}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.capability}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        API: {p.docs}
                      </p>

                      {/* Credential hint when in real mode and creds are missing */}
                      {isRealMode && p.credentialStatus === "missing" && (
                        <div className="flex items-start gap-1.5 mt-2 p-1.5 rounded bg-muted/40 text-[10px] text-muted-foreground">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>Set in .env.local: {p.setupNote}</span>
                        </div>
                      )}

                      {/* Connected accounts */}
                      {p.connectedAccounts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.connectedAccounts.map((account) => (
                            <div key={account.id} className="flex items-center gap-1">
                              <BandChip
                                name={account.band.name}
                                color={account.band.coverColor}
                                size="sm"
                              />
                              <span className="text-[10px] text-muted-foreground">
                                @{account.handle}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" disabled>
                      {isRealMode && p.credentialStatus === "ready"
                        ? "Validate live connection"
                        : "Connect (set API keys first)"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Livestream providers */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Livestream Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              platform: "YOUTUBE",
              label: "YouTube Live",
              note: "RTMP + stream management via YouTube Data API. Adapter in next sprint.",
            },
            {
              platform: "TWITCH",
              label: "Twitch Live",
              note: "Channel metadata and stream title via Helix API. OBS handles RTMP.",
            },
          ].map((p) => (
            <Card key={p.platform} className="opacity-75">
              <CardContent className="p-4 flex items-start gap-3">
                <PlatformIcon platform={p.platform} size="lg" />
                <div>
                  <p className="font-medium text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.note}</p>
                  <Badge variant="outline" className="text-xs mt-2">
                    Coming next
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Connecting Real APIs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            1. Copy{" "}
            <code className="bg-muted px-1 rounded text-xs">.env.example</code> to{" "}
            <code className="bg-muted px-1 rounded text-xs">.env.local</code>
          </p>
          <p>
            2. Fill in API credentials for the platforms you want (see{" "}
            <code className="bg-muted px-1 rounded text-xs">setup notes</code> in each card
            above)
          </p>
          <p>
            3. Set{" "}
            <code className="bg-muted px-1 rounded text-xs">SOCIAL_ADAPTER=real</code> in{" "}
            <code className="bg-muted px-1 rounded text-xs">.env.local</code>
          </p>
          <p>4. Restart the dev server — credential status updates immediately</p>
          <p>
            5. Platforms without real adapters yet (Bluesky, TikTok, Twitch) fall back to mock
            automatically
          </p>
          <p className="pt-2 border-t border-border">
            See{" "}
            <code className="bg-muted px-1 rounded text-xs">docs/architecture.md</code> for
            per-platform OAuth setup guides and the full real adapter hookup walkthrough.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
