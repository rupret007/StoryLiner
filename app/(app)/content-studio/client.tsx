"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import type { Band, BandVoiceProfile, PlatformAccount } from "@prisma/client";
import { generateContentAction } from "./actions";

type BandWithProfile = Band & {
  voiceProfile: BandVoiceProfile | null;
  platformAccounts: PlatformAccount[];
};

const CAMPAIGN_TYPES = [
  { value: "SHOW_ANNOUNCEMENT", label: "Show Announcement" },
  { value: "REMINDER", label: "Reminder" },
  { value: "DAY_OF_SHOW", label: "Day of Show" },
  { value: "LAST_CALL", label: "Last Call" },
  { value: "THANK_YOU", label: "Thank You" },
  { value: "RECAP", label: "Recap" },
  { value: "REHEARSAL", label: "Rehearsal" },
  { value: "BEHIND_THE_SCENES", label: "Behind the Scenes" },
  { value: "RELEASE_TEASER", label: "Release Teaser" },
  { value: "RELEASE_DAY", label: "Release Day" },
  { value: "MERCH_PUSH", label: "Merch Push" },
  { value: "CROWD_ENGAGEMENT", label: "Crowd Engagement" },
  { value: "FAN_QUESTION", label: "Fan Question" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "LIVESTREAM_ANNOUNCEMENT", label: "Livestream Announcement" },
  { value: "LIVESTREAM_REMINDER", label: "Livestream Reminder" },
  { value: "GOING_LIVE_NOW", label: "Going Live Now" },
  { value: "POST_STREAM_THANK_YOU", label: "Post-Stream Thank You" },
  { value: "POST_STREAM_RECAP", label: "Post-Stream Recap" },
  { value: "CLIP_PROMOTION", label: "Clip Promotion" },
];

const PLATFORMS = [
  "FACEBOOK", "INSTAGRAM", "BLUESKY", "TIKTOK", "YOUTUBE", "TWITCH",
];

const TONES = [
  { value: "AUTHENTIC", label: "Authentic" },
  { value: "ENERGETIC", label: "Energetic" },
  { value: "NOSTALGIC", label: "Nostalgic" },
  { value: "FUNNY", label: "Funny" },
  { value: "RAW", label: "Raw" },
  { value: "HYPE", label: "Hype" },
  { value: "GRATEFUL", label: "Grateful" },
  { value: "MYSTERIOUS", label: "Mysterious" },
  { value: "DIRECT", label: "Direct" },
];

interface ContentStudioClientProps {
  bands: BandWithProfile[];
  selectedBandId?: string;
}

export function ContentStudioClient({ bands, selectedBandId }: ContentStudioClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedBand, setSelectedBand] = useState(
    bands.find((b) => b.id === selectedBandId) ?? bands[0]
  );
  const [campaignType, setCampaignType] = useState("SHOW_ANNOUNCEMENT");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [contentLength, setContentLength] = useState("MEDIUM");
  const [toneVariant, setToneVariant] = useState(
    selectedBand?.voiceProfile?.defaultTone ?? "AUTHENTIC"
  );
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [showDate, setShowDate] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const [generatedDraftId, setGeneratedDraftId] = useState<string | null>(null);

  function handleBandChange(bandId: string) {
    const band = bands.find((b) => b.id === bandId);
    if (band) {
      setSelectedBand(band);
      if (band.voiceProfile?.defaultTone) {
        setToneVariant(band.voiceProfile.defaultTone);
      }
    }
  }

  function handleGenerate() {
    if (!selectedBand) return;

    startTransition(async () => {
      try {
        const result = await generateContentAction({
          bandId: selectedBand.id,
          campaignType: campaignType as Parameters<typeof generateContentAction>[0]["campaignType"],
          platform: platform as Parameters<typeof generateContentAction>[0]["platform"],
          contentLength: contentLength as "SHORT" | "MEDIUM" | "LONG",
          toneVariant: toneVariant as Parameters<typeof generateContentAction>[0]["toneVariant"],
          context: {
            venue: venue || undefined,
            city: city || undefined,
            showDate: showDate || undefined,
            ticketUrl: ticketUrl || undefined,
            additionalContext: additionalContext || undefined,
          },
        });

        setGeneratedDraftId(result.id);
        toast.success("Draft created and sent to review queue.", {
          action: {
            label: "Review now",
            onClick: () => router.push("/review-queue"),
          },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  if (bands.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">No bands configured yet.</p>
        <Button asChild>
          <a href="/bands">Add a Band</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Configuration Panel */}
      <div className="lg:col-span-2 space-y-4">
        {/* Band selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select Band</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {bands.map((band) => (
                <button
                  key={band.id}
                  onClick={() => handleBandChange(band.id)}
                  className="focus:outline-none focus:ring-2 focus:ring-ring rounded-full"
                >
                  <BandChip
                    name={band.name}
                    color={band.coverColor}
                    size="md"
                    className={
                      selectedBand?.id === band.id
                        ? "ring-2 ring-offset-1 ring-offset-background"
                        : "opacity-60 hover:opacity-80 transition-opacity"
                    }
                  />
                </button>
              ))}
            </div>
            {selectedBand?.voiceProfile && (
              <p className="text-xs text-muted-foreground mt-3">
                {selectedBand.voiceProfile.toneDescription.slice(0, 120)}…
              </p>
            )}
          </CardContent>
        </Card>

        {/* Campaign type + platform */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Content Type</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className="focus:outline-none rounded"
                  >
                    <PlatformIcon
                      platform={p}
                      size="md"
                      className={platform === p ? "ring-2 ring-primary ring-offset-1 ring-offset-background rounded" : "opacity-50 hover:opacity-80 transition-opacity"}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Length</Label>
              <div className="flex gap-2">
                {(["SHORT", "MEDIUM", "LONG"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setContentLength(l)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      contentLength === l
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {l.charAt(0) + l.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={toneVariant} onValueChange={(v) => setToneVariant(v as typeof toneVariant)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Context */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Context (optional)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input
                placeholder="The Roxy, House of Blues…"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                placeholder="Los Angeles, Chicago…"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Show Date</Label>
              <Input
                type="date"
                value={showDate}
                onChange={(e) => setShowDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used in generated caption — e.g. &ldquo;Friday May 2&rdquo;
              </p>
            </div>
            <div className="space-y-2">
              <Label>Ticket URL</Label>
              <Input
                type="url"
                placeholder="https://bandsintown.com/…"
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Additional context</Label>
              <Textarea
                placeholder="First show back since the hiatus. Special guest. Acoustic set only…"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleGenerate}
            disabled={isPending || !selectedBand}
            size="lg"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Draft
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tips Panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">How this works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Pick your band. Each one has a completely separate voice profile.</p>
            <p>2. Set the campaign type, platform, and tone.</p>
            <p>3. Add context if you have it — venue, date, extra notes.</p>
            <p>4. Generate. The draft goes to the review queue before anything is published.</p>
            <p className="text-foreground font-medium">Nothing auto-publishes.</p>
          </CardContent>
        </Card>

        {selectedBand?.voiceProfile && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <BandChip name={selectedBand.name} color={selectedBand.coverColor} size="sm" />
                {" "}Voice Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedBand.voiceProfile.toneRules.slice(0, 4).map((rule, i) => (
                <p key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-primary shrink-0">—</span>
                  {rule}
                </p>
              ))}
              {selectedBand.voiceProfile.bannedPhrases.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1.5">Banned phrases:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedBand.voiceProfile.bannedPhrases.slice(0, 5).map((p) => (
                      <Badge key={p} variant="destructive" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {generatedDraftId && (
          <Card className="border-emerald-600/40 bg-emerald-950/20">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-400">Draft created.</p>
              <p className="text-xs text-muted-foreground">
                Sent to the review queue. Nothing is published until you approve and schedule it.
              </p>
              <Button size="sm" className="w-full" asChild>
                <a href="/review-queue">
                  Go to Review Queue <ArrowRight className="h-3 w-3" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
