"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { StatusBadge } from "@/components/storyliner/status-badge";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  X,
  Archive,
  Copy,
  RotateCcw,
  AlertTriangle,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CalendarClock,
  Loader2,
  Pause,
  Undo2,
} from "lucide-react";
import { formatDatetimeLocalValue, formatRelative } from "@/lib/utils";
import {
  approveHighRiskConfirmDescription,
  approveSuccessToast,
  approvedEmptyState,
  approvedQueueTabLabel,
  approvedScheduleHelp,
  captionMutationSuccessToast,
  denyConfirmDescription,
  denySuccessToast,
  draftHasPossibleLiveWrite,
  duplicateDraftSuccessToast,
  heldEmptyState,
  holdConfirmDescription,
  holdSuccessToast,
  needsReviewEmptyState,
  resumeHeldSuccessToast,
  scheduleSuccessToast,
  shouldOpenApprovedTabAfterApprove,
  shouldOpenHeldTabAfterHold,
} from "@/lib/services/publish/safety";
import {
  approveDraft,
  denyDraft,
  holdDraft,
  resumeHeldDraft,
  archiveDraft,
  duplicateDraft,
  rewriteDraftAction,
  updateDraftCaption,
  attachDraftMedia,
  scheduleApprovedDraft,
} from "./actions";
import type {
  Band,
  BandVoiceProfile,
  Campaign,
  Draft,
  DraftVersion,
  PlatformAccount,
} from "@prisma/client";

type DraftWithRelations = Draft & {
  band: Band & {
    voiceProfile: BandVoiceProfile | null;
    platformAccounts: PlatformAccount[];
  };
  versions: DraftVersion[];
  campaign: Campaign | null;
};

const REWRITE_DIRECTIVES = [
  { value: "funnier", label: "Funnier" },
  { value: "lessCheesy", label: "Less cheesy" },
  { value: "morePunk", label: "More punk" },
  { value: "cleaner", label: "Cleaner" },
  { value: "moreHuman", label: "More human" },
  { value: "moreConcise", label: "More concise" },
  { value: "moreUrgency", label: "More urgency" },
];

function defaultScheduleLocalValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return formatDatetimeLocalValue(d);
}

function ScheduleDialog({
  draft,
  open,
  onClose,
  onScheduled,
}: {
  draft: DraftWithRelations;
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [platformAccountId, setPlatformAccountId] = useState("");
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleLocalValue);
  const [checkedNoLivePost, setCheckedNoLivePost] = useState(false);
  const possibleLiveWrite = draftHasPossibleLiveWrite(draft.reviewNotes);

  // Only accounts matching draft platform
  const compatibleAccounts = draft.band.platformAccounts.filter(
    (a) => a.platform === draft.platform && a.isActive
  );

  function handleSchedule() {
    if (!platformAccountId) {
      toast.error("Select a platform account first.");
      return;
    }
    if (!scheduledFor) {
      toast.error("Choose a time to schedule.");
      return;
    }
    if (possibleLiveWrite && !checkedNoLivePost) {
      toast.error("Check Facebook / Instagram / YouTube first. A previous write may already be live.");
      return;
    }

    startTransition(async () => {
      try {
        await scheduleApprovedDraft({
          draftId: draft.id,
          platformAccountId,
          scheduledFor: new Date(scheduledFor).toISOString(),
          confirmCheckedNoLivePost: possibleLiveWrite ? checkedNoLivePost : undefined,
        });
        toast.success(scheduleSuccessToast({ possibleLiveWrite }));
        onClose();
        onScheduled();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Scheduling failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule — separate yes from Bob&apos;s draft</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 mb-2">
            <PlatformIcon platform={draft.platform} size="md" showLabel />
            <BandChip name={draft.band.name} color={draft.band.coverColor} />
          </div>

          <p className="text-sm text-muted-foreground line-clamp-3">{draft.caption}</p>

          <div className="space-y-2">
            <Label>Platform Account</Label>
            {compatibleAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active {draft.platform} account for {draft.band.name}. Add one in Integrations.
              </p>
            ) : (
              <Select value={platformAccountId} onValueChange={setPlatformAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {compatibleAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.handle}
                      {!a.isConnected && " (mock)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Schedule Time</Label>
            <Input
              type="datetime-local"
              value={scheduledFor}
              min={formatDatetimeLocalValue(new Date())}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Jeff talks to Bob; this queue is the engine. Local time, must be
              in the future. Scheduling creates a worker job — it does not
              publish until that job is due.
            </p>
            {draft.platform === "INSTAGRAM" && draft.mediaUrls.length === 0 && (
              <p className="text-xs text-amber-300">
                Real Instagram will refuse this schedule without a public https image or video.
              </p>
            )}
            {draft.platform === "YOUTUBE" && (
              <p className="text-xs text-amber-300">
                Real YouTube will not live-publish a text post. Description updates stay opt-in.
              </p>
            )}
            {possibleLiveWrite && (
              <label className="flex items-start gap-2 text-xs text-amber-200">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checkedNoLivePost}
                  onChange={(e) => setCheckedNoLivePost(e.target.checked)}
                />
                I checked Facebook / Instagram / YouTube. No live post. Schedule is still not publish.
              </label>
            )}
            {draft.platform === "TWITTER" && (
              <p className="text-xs text-amber-300">
                Twitter/X is schema leftover. StoryLiner will refuse this schedule. No tweet will go out.
              </p>
            )}
            {(draft.platform === "TIKTOK" ||
              draft.platform === "BLUESKY" ||
              draft.platform === "TWITCH") && (
              <p className="text-xs text-amber-300">
                {draft.platform} is not a live destination. Real mode will refuse this schedule.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={
              isPending ||
              !platformAccountId ||
              !scheduledFor ||
              compatibleAccounts.length === 0 ||
              (possibleLiveWrite && !checkedNoLivePost)
            }
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scheduling…
              </>
            ) : (
              <>
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel,
  isPending,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant ?? "default"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DraftCard({
  draft,
  onAction,
  onApproved,
  onHeld,
}: {
  draft: DraftWithRelations;
  onAction: () => void;
  onApproved?: () => void;
  onHeld?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState(draft.caption);
  const [showHistory, setShowHistory] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [confirmDeny, setConfirmDeny] = useState(false);
  const [confirmHold, setConfirmHold] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmHighRisk, setConfirmHighRisk] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState(draft.mediaUrls[0] ?? "");
  const possibleLiveWrite = draftHasPossibleLiveWrite(draft.reviewNotes);
  const captionMutationSourceStatus =
    draft.status === "APPROVED" || draft.status === "HELD"
      ? draft.status
      : "IN_REVIEW";

  function handleApprove(confirmHighRiskApprove = false) {
    startTransition(async () => {
      try {
        await approveDraft(draft.id, undefined, confirmHighRiskApprove);
        toast.success(approveSuccessToast({ possibleLiveWrite }));
        if (onApproved) {
          onApproved();
        } else {
          onAction();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed.");
      }
    });
  }

  function handleHold() {
    setConfirmHold(false);
    startTransition(async () => {
      try {
        await holdDraft(draft.id);
        toast.success(holdSuccessToast({ possibleLiveWrite }));
        if (onHeld) {
          onHeld();
        } else {
          onAction();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Hold failed.");
      }
    });
  }

  function handleDeny() {
    setConfirmDeny(false);
    startTransition(async () => {
      try {
        await denyDraft(draft.id, "Denied from review queue");
        toast.success(denySuccessToast({ possibleLiveWrite }));
        onAction();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Deny failed.");
      }
    });
  }

  function handleResume() {
    startTransition(async () => {
      try {
        await resumeHeldDraft(draft.id);
        toast.success(resumeHeldSuccessToast({ possibleLiveWrite }));
        onAction();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not return to review.");
      }
    });
  }

  function handleArchive() {
    setConfirmArchive(false);
    startTransition(async () => {
      await archiveDraft(draft.id);
      toast.success("Draft archived.");
      onAction();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      try {
        await duplicateDraft(draft.id);
        toast.success(
          duplicateDraftSuccessToast({
            possibleLiveWrite,
          })
        );
        onAction();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not copy draft.");
      }
    });
  }

  function handleRewrite(directive: string) {
    startTransition(async () => {
      await rewriteDraftAction({
        draftId: draft.id,
        directive:
          directive as Parameters<typeof rewriteDraftAction>[0]["directive"],
      });
      toast.success(
        captionMutationSuccessToast({
          kind: "rewrite",
          fromStatus: captionMutationSourceStatus,
          possibleLiveWrite,
        })
      );
      onAction();
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      await updateDraftCaption(draft.id, editedCaption);
      setEditingCaption(false);
      toast.success(
        captionMutationSuccessToast({
          kind: "edit",
          fromStatus: captionMutationSourceStatus,
          possibleLiveWrite,
        })
      );
      onAction();
    });
  }

  function handleSaveMedia() {
    startTransition(async () => {
      try {
        await attachDraftMedia({
          draftId: draft.id,
          mediaUrls: mediaUrlInput.trim() ? [mediaUrlInput.trim()] : [],
        });
        toast.success(mediaUrlInput.trim() ? "Media URL saved." : "Media URL cleared.");
        onAction();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save media URL.");
      }
    });
  }

  const riskColor =
    draft.riskLevel === "HIGH"
      ? "text-rose-400"
      : draft.riskLevel === "MEDIUM"
      ? "text-amber-400"
      : "text-emerald-400";

  return (
    <>
      <ScheduleDialog
        draft={draft}
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onScheduled={onAction}
      />
      <ConfirmDialog
        open={confirmHold}
        title="Hold this draft?"
        description={holdConfirmDescription({ possibleLiveWrite })}
        confirmLabel="Hold"
        onConfirm={handleHold}
        onCancel={() => setConfirmHold(false)}
        isPending={isPending}
      />
      <ConfirmDialog
        open={confirmDeny}
        title="Deny this draft?"
        description={denyConfirmDescription({ possibleLiveWrite })}
        confirmLabel="Deny"
        confirmVariant="destructive"
        onConfirm={handleDeny}
        onCancel={() => setConfirmDeny(false)}
        isPending={isPending}
      />
      <ConfirmDialog
        open={confirmArchive}
        title="Archive this draft?"
        description="Removes this draft from the review queue. Archive does not publish, and it does not move the caption to Published Posts."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
        isPending={isPending}
      />
      <ConfirmDialog
        open={confirmHighRisk}
        title="Approve this high-risk draft?"
        description={approveHighRiskConfirmDescription({ possibleLiveWrite })}
        confirmLabel="Approve anyway"
        confirmVariant="destructive"
        onConfirm={() => {
          setConfirmHighRisk(false);
          handleApprove(true);
        }}
        onCancel={() => setConfirmHighRisk(false)}
        isPending={isPending}
      />

      <Card
        className={
          draft.status === "APPROVED"
            ? "border-emerald-600/30"
            : draft.status === "HELD"
            ? "border-blue-600/30"
            : draft.status === "REJECTED"
            ? "border-rose-600/20"
            : ""
        }
      >
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-start gap-3">
            <PlatformIcon platform={draft.platform} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BandChip name={draft.band.name} color={draft.band.coverColor} />
                <StatusBadge status={draft.status} />
                <Badge variant="outline" className="text-xs">
                  {draft.toneVariant}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatRelative(draft.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 space-y-3">
          {/* Caption */}
          {editingCaption ? (
            <div className="space-y-2">
              <Textarea
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                className="min-h-[100px] text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingCaption(false);
                    setEditedCaption(draft.caption);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {draft.caption}
              </p>
              {draft.hashtags.length > 0 && (
                <p className="text-xs text-primary mt-1">
                  {draft.hashtags.join(" ")}
                </p>
              )}
              {draft.mediaUrls.length > 0 ? (
                <p className="text-xs text-muted-foreground mt-1 break-all">
                  Media: {draft.mediaUrls[0]}
                </p>
              ) : draft.platform === "INSTAGRAM" ? (
                <p className="text-xs text-amber-300 mt-1">
                  No media URL — real Instagram will fail closed.
                </p>
              ) : null}
              {draftHasPossibleLiveWrite(draft.reviewNotes) && (
                <p className="text-xs text-amber-200 mt-2">
                  A previous Facebook / Instagram / YouTube write may already be live.
                  Check the platform before scheduling again.
                </p>
              )}
            </div>
          )}

          {/* Brand fit */}
          {draft.brandFitScore !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Brand fit</span>
                <span className="text-xs font-medium text-foreground">
                  {draft.brandFitScore}/100
                </span>
              </div>
              <Progress value={draft.brandFitScore} className="h-1.5" />
            </div>
          )}

          {/* Risk flags */}
          {draft.riskFlags.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-600/10 border border-amber-600/20">
              <AlertTriangle
                className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${riskColor}`}
              />
              <div className="space-y-0.5">
                {draft.riskFlags.map((flag, i) => (
                  <p key={i} className="text-xs text-amber-300">
                    {flag}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Expandable section */}
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {isExpanded ? "Less" : "Rewrites and details"}
          </button>

          {isExpanded && (
            <div className="space-y-3 border-t border-border pt-3">
              {/* Quick rewrites */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Rewrite as…
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {REWRITE_DIRECTIVES.map((d) => (
                    <Button
                      key={d.value}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleRewrite(d.value)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        d.label
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Version history */}
              {draft.versions.length > 1 && (
                <div>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Version history ({draft.versions.length})
                  </button>
                  {showHistory && (
                    <div className="mt-2 space-y-2">
                      {draft.versions.map((v) => (
                        <div
                          key={v.id}
                          className="p-2 rounded-md bg-muted/30 text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground">
                              v{v.version}
                            </span>
                            {v.rewriteDirective && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {v.rewriteDirective}
                              </Badge>
                            )}
                          </div>
                          <p className="text-foreground line-clamp-2">
                            {v.caption}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {draft.altText && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Alt text</p>
                  <p className="text-xs text-foreground">{draft.altText}</p>
                </div>
              )}
              {draft.imagePrompt && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Image prompt
                  </p>
                  <p className="text-xs text-foreground italic">
                    {draft.imagePrompt}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Public media URL (https)
                </p>
                {draft.mediaUrls.length > 0 && (
                  <p className="text-xs text-foreground break-all">
                    Attached: {draft.mediaUrls[0]}
                  </p>
                )}
                <Input
                  type="url"
                  placeholder="https://…/show-photo.jpg"
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveMedia}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save media URL"}
                </Button>
                {draft.platform === "INSTAGRAM" && (
                  <p className="text-xs text-muted-foreground">
                    Real Instagram will not go live without this.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons — Approve / Hold / Deny never publish */}
          <div className="space-y-2 pt-1 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              Bob drafted this. Approve, Hold, and Deny are Jeff&apos;s review
              decisions only. None of them publish.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {(draft.status === "IN_REVIEW" || draft.status === "HELD") && (
                <Button
                  size="sm"
                  onClick={() =>
                    draft.riskLevel === "HIGH"
                      ? setConfirmHighRisk(true)
                      : handleApprove(false)
                  }
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Approve
                </Button>
              )}

              {(draft.status === "IN_REVIEW" || draft.status === "APPROVED") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmHold(true)}
                  disabled={isPending}
                  title="Park this draft. Does not publish."
                >
                  <Pause className="h-3.5 w-3.5" />
                  Hold
                </Button>
              )}

              {(draft.status === "IN_REVIEW" || draft.status === "HELD") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDeny(true)}
                  disabled={isPending}
                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-600/10"
                  title="Deny this draft. Does not publish."
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="ml-1">Deny</span>
                </Button>
              )}

              {draft.status === "HELD" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResume}
                  disabled={isPending}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Back to review
                </Button>
              )}

              {draft.status === "APPROVED" && (
                <Button
                  size="sm"
                  onClick={() => setShowSchedule(true)}
                  disabled={isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Schedule
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingCaption(!editingCaption)}
                disabled={isPending || draft.status === "REJECTED"}
                title={
                  draft.status === "APPROVED"
                    ? "Saving an edit returns this to Needs Review. This does not publish."
                    : undefined
                }
              >
                Edit
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleDuplicate}
                disabled={isPending}
                title="Duplicate draft"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-1">Copy</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmArchive(true)}
                disabled={isPending}
                className="text-muted-foreground hover:text-foreground ml-auto"
                title="Archive draft"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

interface ReviewQueueClientProps {
  drafts: DraftWithRelations[];
}

export function ReviewQueueClient({ drafts }: ReviewQueueClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState("review");

  const inReview = drafts.filter((d) => d.status === "IN_REVIEW");
  const held = drafts.filter((d) => d.status === "HELD");
  const approved = drafts.filter((d) => d.status === "APPROVED");
  const denied = drafts.filter((d) => d.status === "REJECTED");
  const approvedPossibleLiveWriteCount = approved.filter((d) =>
    draftHasPossibleLiveWrite(d.reviewNotes)
  ).length;
  const reviewEmpty = needsReviewEmptyState({
    approvedCount: approved.length,
    heldCount: held.length,
    possibleLiveWriteCount: approvedPossibleLiveWriteCount,
  });
  const approvedEmpty = approvedEmptyState({
    inReviewCount: inReview.length,
    heldCount: held.length,
    possibleLiveWriteCount:
      inReview.length > 0
        ? inReview.filter((d) => draftHasPossibleLiveWrite(d.reviewNotes)).length
        : held.filter((d) => draftHasPossibleLiveWrite(d.reviewNotes)).length,
  });
  const heldEmpty = heldEmptyState({
    approvedCount: approved.length,
    inReviewCount: inReview.length,
    possibleLiveWriteCount:
      approved.length > 0
        ? approvedPossibleLiveWriteCount
        : inReview.filter((d) => draftHasPossibleLiveWrite(d.reviewNotes)).length,
  });

  function refresh() {
    router.refresh();
  }

  function handleApproved(draftId: string) {
    const remainingReview = inReview.filter((d) => d.id !== draftId);
    const remainingHeld = held.filter((d) => d.id !== draftId);
    if (
      shouldOpenApprovedTabAfterApprove({
        currentTab: tab,
        remainingNeedsReviewCount: remainingReview.length,
        remainingHeldCount: remainingHeld.length,
      })
    ) {
      setTab("approved");
    }
    refresh();
  }

  function handleHeld(draftId: string) {
    const remainingApproved = approved.filter((d) => d.id !== draftId);
    if (
      shouldOpenHeldTabAfterHold({
        currentTab: tab,
        remainingApprovedCount: remainingApproved.length,
      })
    ) {
      setTab("held");
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">{inReview.length} need review</Badge>
          <Badge variant="info">{held.length} on hold</Badge>
          <Badge variant="success">{approved.length} approved</Badge>
          <Badge variant="destructive">{denied.length} denied</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Bob drafts. Jeff decides here. Approve / Hold / Deny never publish.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="review">
            Needs Review ({inReview.length})
          </TabsTrigger>
          <TabsTrigger value="held">
            On Hold ({held.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            {approvedQueueTabLabel({
              count: approved.length,
              possibleLiveWriteCount: approvedPossibleLiveWriteCount,
            })}
          </TabsTrigger>
          <TabsTrigger value="denied">
            Denied ({denied.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4">
          {inReview.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={reviewEmpty.title}
              description={reviewEmpty.description}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {inReview.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onAction={refresh}
                  onApproved={() => handleApproved(draft.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="held" className="mt-4">
          {held.length === 0 ? (
            <EmptyState
              icon={Pause}
              title={heldEmpty.title}
              description={heldEmpty.description}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {held.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onAction={refresh}
                  onApproved={() => handleApproved(draft.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          {approved.length === 0 ? (
            <EmptyState
              icon={Check}
              title={approvedEmpty.title}
              description={approvedEmpty.description}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {approvedScheduleHelp({
                  possibleLiveWriteCount: approvedPossibleLiveWriteCount,
                })}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {approved.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onAction={refresh}
                    onHeld={() => handleHeld(draft.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="denied" className="mt-4">
          {denied.length === 0 ? (
            <EmptyState
              icon={X}
              title="No denied drafts"
              description="Deny rejects a caption. Duplicate it if you want another pass."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {denied.map((draft) => (
                <DraftCard key={draft.id} draft={draft} onAction={refresh} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
