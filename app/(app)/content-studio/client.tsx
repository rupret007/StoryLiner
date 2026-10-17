"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { z } from "zod";
import {
  CAMPAIGN_CONTEXT_CHANGED,
  CAMPAIGN_CONTEXT_UNAVAILABLE,
  CAMPAIGN_CONTEXT_OFFLINE_ONLY,
  CAMPAIGN_CONTEXT_TYPE_MISMATCH,
  type CampaignContextView,
} from "@/lib/services/content/campaign-context";
import { campaignTypeLabel, platformLabel } from "@/lib/utils";
import {
  generateSuccessHandoff,
  reviewQueueFocusHref,
} from "@/lib/services/publish/review-snapshot";
import { PROMO_PIPELINE_PATH } from "@/lib/services/publish/review-desk";
import { generateStudioDraftAction } from "./actions";

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

const PLATFORMS = ["FACEBOOK", "INSTAGRAM", "YOUTUBE"] as const;

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
  linkedContext?: CampaignContextView | null;
  contextError?: string | null;
  contextIdentity?: string;
}

type GenerationOrigin = {
  bandId: string;
  bandName: string;
  campaignId: string | null;
  campaignName: string | null;
  campaignType: string;
  eventTitle: string | null;
  platform: string;
};
const generatedReceipt = z.object({
  id: z.string().cuid(), bandId: z.string(), campaignId: z.string().nullable(),
  platform: z.enum(PLATFORMS), status: z.literal("IN_REVIEW"),
  caption: z.string().min(1).max(50000),
  hashtags: z.array(z.string().max(500)).max(100),
  mediaUrls: z.array(z.string().max(2000)).max(5),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  riskFlags: z.array(z.string().max(5000)).max(100),
});
type GeneratedSnapshot = z.infer<typeof generatedReceipt> & { origin: GenerationOrigin };
const GENERATION_DEADLINE_MS = 60_000;

function GeneratedSnapshotCard({
  snapshot,
}: {
  snapshot: GeneratedSnapshot;
}) {
  const handoff = generateSuccessHandoff({
    riskLevel: snapshot.riskLevel,
    riskFlagCount: snapshot.riskFlags.length,
  });

  return (
    <Card className="min-w-0 border-emerald-600/40 bg-emerald-950/20" data-testid="generated-snapshot">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium text-emerald-400">
          Guarded snapshot is ready.
        </p>
        <p className="text-xs text-muted-foreground break-words" data-testid="generated-origin">
          Generated for {snapshot.origin.bandName} · {platformLabel(snapshot.origin.platform)} · {campaignTypeLabel(snapshot.origin.campaignType)}
          {snapshot.origin.campaignName ? ` · Campaign: ${snapshot.origin.campaignName}` : snapshot.origin.eventTitle ? " · Event-linked draft" : " · Unlinked draft"}
          {snapshot.origin.eventTitle ? ` · Event: ${snapshot.origin.eventTitle}` : ""}
        </p>
        <p className="text-xs text-foreground whitespace-pre-wrap break-words line-clamp-6">
          {snapshot.caption}
        </p>
        {snapshot.hashtags.length > 0 && (
          <p className="text-xs text-primary">{snapshot.hashtags.join(" ")}</p>
        )}
        {snapshot.mediaUrls.length > 0 && (
          <p className="text-xs text-muted-foreground break-all">
            Media: {snapshot.mediaUrls[0]}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{handoff.guardSummary}</p>
        {snapshot.riskFlags.map((flag) => (
          <p key={flag} className="text-xs text-amber-300">
            {flag}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">{handoff.nextAction}</p>
        <Button size="sm" className="w-full" asChild>
          <a href={reviewQueueFocusHref(snapshot.id)}>
            Review this snapshot <ArrowRight className="h-3 w-3" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ContentStudioClient(props: ContentStudioClientProps) {
  // URL identity changes retire old work; a background receipt refresh does
  // not. The session below holds input until an explicit facts reload.
  const key = props.contextIdentity ?? JSON.stringify([props.selectedBandId ?? null, props.linkedContext?.campaignId ?? null, props.linkedContext?.eventId ?? null]);
  return <StudioSession key={key} {...props} />;
}

function StudioSession({ bands, selectedBandId, linkedContext: incomingContext = null, contextError: incomingError = null }: ContentStudioClientProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [linkedContext, setLinkedContext] = useState(incomingContext);
  const [contextError, setContextError] = useState(incomingError);
  const [reloadRequested, setReloadRequested] = useState(false);
  const incomingBandId = selectedBandId
    ?? (!incomingError && !incomingContext ? bands[0]?.id : undefined);
  // The no-query page may choose a different first active band after refresh.
  // Existing manual text belongs to the original band until explicit navigation.
  const [sessionBandId] = useState(incomingBandId);
  const selectedBand = bands.find((band) => band.id === sessionBandId);
  const [generationState, setGenerationState] = useState<"idle" | "pending" | "unconfirmed">("idle");
  const [generationError, setGenerationError] = useState("");
  const [savedContextBlocked, setSavedContextBlocked] = useState(false);
  const [privacyHold, setPrivacyHold] = useState(false);
  const [campaignType, setCampaignType] = useState<string>(linkedContext?.campaignType ?? "SHOW_ANNOUNCEMENT");
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
  const [mediaUrl, setMediaUrl] = useState("");

  const [generatedSnapshot, setGeneratedSnapshot] = useState<GeneratedSnapshot | null>(null);
  const mounted = useRef(true);
  const activeAttempt = useRef<{ timer: ReturnType<typeof setTimeout> | null } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeAttempt.current?.timer) clearTimeout(activeAttempt.current.timer);
      activeAttempt.current = null;
    };
  }, []);
  useEffect(() => {
    // A reload authorizes only this completed navigation, never a later
    // background refresh if the server returned identical props this time.
    if (!reloadRequested || navigating) return;
    setReloadRequested(false);
    setLinkedContext(incomingContext);
    setContextError(incomingError);
    setCampaignType(incomingContext?.campaignType ?? "SHOW_ANNOUNCEMENT");
    setSavedContextBlocked(false);
  }, [incomingContext, incomingError, navigating, reloadRequested]);
  const isPending = generationState === "pending";
  const configurationLocked = isPending || navigating;
  const linkedMismatch = Boolean(linkedContext && linkedContext.bandId !== selectedBand?.id);
  const savedContextChanged = (incomingContext?.receipt ?? null) !== (linkedContext?.receipt ?? null)
    || incomingError !== contextError;
  const blockedContext = incomingBandId !== sessionBandId
    ? "The selected band changed or became unavailable. Your input and previous result are kept. Choose a band below deliberately to start a clean session; your work will not move to another band automatically."
    : savedContextChanged
    ? "The saved campaign context changed or became unavailable. Your input and previous result are kept. Reload and review current facts before generating."
    : contextError || (linkedMismatch ? CAMPAIGN_CONTEXT_UNAVAILABLE : null);
  const hasTypedContext = Boolean(venue || city || showDate || ticketUrl || additionalContext || mediaUrl);
  const needsLeaveWarning = hasTypedContext || generationState !== "idle";
  useEffect(() => {
    if (!needsLeaveWarning) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [needsLeaveWarning]);

  function confirmReset() {
    return !(hasTypedContext || generatedSnapshot || generationState === "unconfirmed")
      || window.confirm("Start a clean Studio session? This clears your typed context, media, and displayed result. Any earlier generation may still be in the review queue; nothing will be resent.");
  }

  function clearInputs() {
    setVenue(""); setCity(""); setShowDate(""); setTicketUrl("");
    setAdditionalContext(""); setMediaUrl(""); setGeneratedSnapshot(null);
    setGenerationError(""); setGenerationState("idle");
  }

  function handleBandChange(bandId: string) {
    if (configurationLocked || activeAttempt.current || !bands.some((band) => band.id === bandId) || !confirmReset()) return;
    clearInputs();
    startNavigation(() => router.push(`/content-studio?bandId=${encodeURIComponent(bandId)}`));
  }

  function reloadContext() {
    if (configurationLocked || activeAttempt.current || !confirmReset()) return;
    clearInputs();
    if (savedContextChanged) {
      setLinkedContext(incomingContext);
      setContextError(incomingError);
      setCampaignType(incomingContext?.campaignType ?? "SHOW_ANNOUNCEMENT");
      setSavedContextBlocked(false);
    }
    // If the new facts were already received, this click adopts
    // exactly those facts. A later different refresh still needs a new choice.
    setReloadRequested(!savedContextChanged);
    startNavigation(() => router.refresh());
  }

  async function handleGenerate() {
    if (!selectedBand || blockedContext || savedContextBlocked || privacyHold || configurationLocked
      || activeAttempt.current || generationState === "unconfirmed") return;
    const origin: GenerationOrigin = {
      bandId: selectedBand.id, bandName: selectedBand.name,
      campaignId: linkedContext?.campaignId ?? null,
      campaignName: linkedContext?.campaignName ?? null,
      campaignType, eventTitle: linkedContext?.eventTitle ?? null, platform,
    };
    const attempt = { timer: null as ReturnType<typeof setTimeout> | null };
    activeAttempt.current = attempt;
    setGenerationState("pending");
    setGenerationError("");
    setGeneratedSnapshot(null);
    try {
      const result = await Promise.race([
        generateStudioDraftAction({
          bandId: selectedBand.id,
          ...(linkedContext?.campaignId ? { campaignId: linkedContext.campaignId } : {}),
          ...(linkedContext?.eventId ? { eventId: linkedContext.eventId } : {}),
          ...(linkedContext ? { contextReceipt: linkedContext.receipt } : {}),
          campaignType: campaignType as Parameters<typeof generateStudioDraftAction>[0]["campaignType"],
          platform: platform as Parameters<typeof generateStudioDraftAction>[0]["platform"],
          contentLength: contentLength as "SHORT" | "MEDIUM" | "LONG",
          toneVariant: toneVariant as Parameters<typeof generateStudioDraftAction>[0]["toneVariant"],
          mediaUrls: mediaUrl.trim() ? [mediaUrl.trim()] : undefined,
          context: linkedContext ? { additionalContext: additionalContext || undefined } : {
            venue: venue || undefined,
            city: city || undefined,
            showDate: showDate || undefined,
            ticketUrl: ticketUrl || undefined,
            additionalContext: additionalContext || undefined,
          },
        }),
        new Promise<never>((_resolve, reject) => {
          attempt.timer = setTimeout(() => reject(new Error("Generation result not confirmed")), GENERATION_DEADLINE_MS);
        }),
      ]);
        if (!mounted.current || activeAttempt.current !== attempt) return;
        if (result?.status === "blocked") {
          const messages = {
            context_changed: CAMPAIGN_CONTEXT_CHANGED,
            context_unavailable: CAMPAIGN_CONTEXT_UNAVAILABLE,
            offline_only: CAMPAIGN_CONTEXT_OFFLINE_ONLY,
            type_mismatch: CAMPAIGN_CONTEXT_TYPE_MISMATCH,
            invalid_input: "Generation did not start. Check your field values and links; operator notes allow up to 500 characters. Your input is kept so you can correct it and try again.",
          };
          if (!Object.hasOwn(messages, result.code)) throw new Error("Generation result not confirmed");
          setPrivacyHold(result.code === "offline_only");
          setSavedContextBlocked(result.code === "context_changed" || result.code === "context_unavailable" || result.code === "type_mismatch");
          setGenerationState("idle");
          setGenerationError(messages[result.code]);
          return;
        }
        if (result?.status !== "saved") throw new Error("Generation result not confirmed");
        const receipt = generatedReceipt.safeParse(result.draft);
        if (!receipt.success || receipt.data.bandId !== origin.bandId
          || receipt.data.campaignId !== origin.campaignId || receipt.data.platform !== origin.platform) {
          throw new Error("Generation result not confirmed");
        }
        const snapshot = { ...receipt.data, origin };
        setGeneratedSnapshot(snapshot);
        setGenerationState("idle");
        const handoff = generateSuccessHandoff({
          riskLevel: snapshot.riskLevel,
          riskFlagCount: snapshot.riskFlags.length,
        });
        toast.success(handoff.toast, {
          action: {
            label: "Review now",
            onClick: () => router.push(reviewQueueFocusHref(snapshot.id)),
          },
        });
      } catch {
        if (!mounted.current || activeAttempt.current !== attempt) return;
        // Thrown server errors are redacted in production; only the typed
        // action result above can prove a known pre-generation refusal.
        setPrivacyHold(false);
        setSavedContextBlocked(false);
        setGenerationState("unconfirmed");
        setGenerationError("Generation is not confirmed. Your input is kept. A draft may still arrive; check the review queue before making another attempt.");
      } finally {
        if (attempt.timer) clearTimeout(attempt.timer);
        if (activeAttempt.current === attempt) activeAttempt.current = null;
      }
  }

  if (bands.length === 0 && !linkedContext && !blockedContext && !hasTypedContext
    && !generatedSnapshot && generationState === "idle") {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">No bands configured yet.</p>
        <Button asChild>
          <Link href="/bands">Add a Band</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Configuration Panel */}
      <fieldset disabled={configurationLocked} className="m-0 min-w-0 border-0 p-0 lg:col-span-2 space-y-4" aria-label="Draft configuration">
        {blockedContext ? <Card className="border-amber-500/40"><CardContent className="p-4 space-y-3" role="alert" data-testid="campaign-context-error">
          <p className="font-medium">Campaign context unavailable</p>
          <p className="text-sm text-muted-foreground">{blockedContext}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={reloadContext}>Reload campaign facts</Button>
            <Button variant="ghost" asChild><Link href="/campaign-builder">Return to Campaign Builder</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">Choose a band below only if you want to start without this link. We will not choose another band for you.</p>
        </CardContent></Card> : null}
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
                  type="button"
                  onClick={() => handleBandChange(band.id)}
                  aria-label={`${blockedContext ? "Start unlinked for" : "Select band"} ${band.name}`}
                  aria-pressed={!blockedContext && selectedBand?.id === band.id}
                  className="min-h-11 focus:outline-none focus:ring-2 focus:ring-ring rounded-full"
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

        {linkedContext && !blockedContext ? <Card data-testid="campaign-context-preview" className="min-w-0 border-primary/40">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Linked campaign context</CardTitle></CardHeader>
          <CardContent className="space-y-3 min-w-0">
            <p className="break-words text-sm font-medium">{linkedContext.campaignName ?? "Linked event"} · {linkedContext.bandName}</p>
            <p className="text-xs text-muted-foreground">Saved records, rechecked when you generate. These facts are read-only here. Missing facts will not be invented.</p>
            <p className="text-xs text-amber-300">Campaign-linked drafts currently use mock mode; live AI context sharing needs owner approval.</p>
            {linkedContext.campaignDescription ? <p className="whitespace-pre-wrap break-words text-sm">{linkedContext.campaignDescription}</p> : null}
            <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              {[
                ["Event", linkedContext.eventTitle],
                ["Campaign target date", linkedContext.facts.campaignTargetDate],
                ["Date and time", linkedContext.facts.showDate],
                ["Venue", linkedContext.facts.venue],
                ["City", linkedContext.facts.city],
                ["Doors", linkedContext.facts.doorsTime],
                ["Set time", linkedContext.facts.setTime],
                ["Ticket URL", linkedContext.facts.ticketUrl],
              ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value || "Not recorded"}</dd></div>)}
            </dl>
            <p className="text-xs text-muted-foreground">Dates display in America/Chicago, the app’s display convention—not a separate event-timezone record.</p>
            {linkedContext.missingFacts.length ? <ul className="list-disc space-y-1 pl-4 text-xs text-amber-300">{linkedContext.missingFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : null}
            <Button type="button" variant="outline" onClick={() => selectedBand && handleBandChange(selectedBand.id)}>Start unlinked draft</Button>
            <p className="text-xs text-muted-foreground">Unlinking or switching bands starts clean: no old event facts, operator notes, media, or displayed result are carried over.</p>
          </CardContent>
        </Card> : !blockedContext ? <p className="text-sm text-muted-foreground" data-testid="unlinked-context">Unlinked draft — context below is supplied by you, not a saved campaign.</p> : null}

        <fieldset disabled={Boolean(blockedContext) || !selectedBand || savedContextBlocked || privacyHold} className="m-0 min-w-0 space-y-4 border-0 p-0">

        {/* Campaign type + platform */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Content Type</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="studio-campaign-type">Campaign Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType} disabled={Boolean(linkedContext?.campaignType) || configurationLocked || Boolean(blockedContext) || savedContextBlocked}>
                <SelectTrigger id="studio-campaign-type" aria-label="Campaign Type">
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
              {linkedContext?.campaignType ? <p className="text-xs text-muted-foreground">The linked campaign defines this type. Start unlinked to choose another.</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={`Platform ${platformLabel(p)}`}
                    aria-pressed={platform === p}
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
                    type="button"
                    aria-pressed={contentLength === l}
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
              <Label htmlFor="studio-tone">Tone</Label>
              <Select value={toneVariant} onValueChange={(v) => setToneVariant(v as typeof toneVariant)} disabled={configurationLocked || Boolean(blockedContext) || savedContextBlocked}>
                <SelectTrigger id="studio-tone" aria-label="Tone">
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
            <CardTitle className="text-sm">{linkedContext ? "Operator note and media (optional)" : "Context (optional)"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!linkedContext ? <>
            <div className="space-y-2">
              <Label htmlFor="studio-venue">Venue</Label>
              <Input
                id="studio-venue"
                placeholder="The Roxy, House of Blues…"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studio-city">City</Label>
              <Input
                id="studio-city"
                placeholder="Los Angeles, Chicago…"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studio-date">Show Date</Label>
              <Input
                id="studio-date"
                type="date"
                value={showDate}
                onChange={(e) => setShowDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used in generated caption — e.g. &ldquo;Friday May 2&rdquo;
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="studio-ticket">Ticket URL</Label>
              <Input
                id="studio-ticket"
                type="url"
                placeholder="https://bandsintown.com/…"
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
              />
            </div>
            </> : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="studio-notes">{linkedContext ? "Operator note" : "Additional context"}</Label>
              <Textarea
                id="studio-notes"
                maxLength={500}
                placeholder="First show back since the hiatus. Special guest. Acoustic set only…"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="min-h-[80px]"
              />
              {linkedContext ? <p className="text-xs text-muted-foreground">Your instruction stays separate from saved facts; it cannot replace the recorded date, venue, times, or ticket link.</p> : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="studio-media">Public media URL (optional)</Label>
              <Input
                id="studio-media"
                maxLength={2000}
                type="url"
                placeholder="https://…/show-photo.jpg"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                https only. Required later for real Instagram. Facebook can go live caption-only.
                YouTube text posts stay manual.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={configurationLocked || !selectedBand || Boolean(blockedContext) || savedContextBlocked || privacyHold || generationState === "unconfirmed"}
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
        </fieldset>
        {generationError ? <Card className="border-amber-500/40"><CardContent className="space-y-3 p-4" role="alert" data-testid="generation-recovery">
          <p className="text-sm">{generationError}</p>
          {privacyHold ? <p className="text-xs text-muted-foreground">Linked generation is paused for owner privacy approval. No provider settings have been changed.</p> : savedContextBlocked ? <Button type="button" variant="outline" onClick={reloadContext}>Reload campaign facts</Button> : generationState === "unconfirmed" ? <>
            <a className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={`/review-queue?bandId=${encodeURIComponent(selectedBand?.id ?? "")}`} target="_blank" rel="noopener noreferrer">Check review queue (opens a new tab)</a>
            <p className="text-xs text-muted-foreground">A late result may still arrive. A new attempt can create another draft; nothing retries automatically.</p>
            <Button type="button" variant="outline" onClick={() => { setGenerationState("idle"); setGenerationError(""); }}>I checked the review queue</Button>
          </> : null}
        </CardContent></Card> : null}
      </fieldset>

      {/* Tips Panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">How this works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="text-foreground font-medium">{PROMO_PIPELINE_PATH}</p>
            <p>Generate a draft for one band and one live platform: Facebook, Instagram, or YouTube.</p>
            <p>Guard always runs. The next yes is Review — the exact caption and media, not a toast.</p>
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

        {generatedSnapshot && (
          <GeneratedSnapshotCard snapshot={generatedSnapshot} />
        )}
      </div>
    </div>
  );
}
