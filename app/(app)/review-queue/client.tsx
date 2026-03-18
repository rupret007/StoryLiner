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
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import {
  approveDraft,
  rejectDraft,
  archiveDraft,
  duplicateDraft,
  rewriteDraftAction,
  updateDraftCaption,
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
  const [scheduledFor, setScheduledFor] = useState("");

  // Only accounts matching draft platform
  const compatibleAccounts = draft.band.platformAccounts.filter(
    (a) => a.platform === draft.platform && a.isActive
  );

  // Default datetime to ~1 hour from now for convenience
  function getDefaultDatetime() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }

  function handleSchedule() {
    if (!platformAccountId) {
      toast.error("Select a platform account first.");
      return;
    }
    if (!scheduledFor) {
      toast.error("Choose a time to schedule.");
      return;
    }

    startTransition(async () => {
      try {
        await scheduleApprovedDraft({
          draftId: draft.id,
          platformAccountId,
          scheduledFor: new Date(scheduledFor).toISOString(),
        });
        toast.success("Post scheduled.");
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
          <DialogTitle>Schedule Post</DialogTitle>
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
              defaultValue={getDefaultDatetime()}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Must be in the future. Worker processes jobs every 5 seconds.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={isPending || !platformAccountId || !scheduledFor || compatibleAccounts.length === 0}
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
}: {
  draft: DraftWithRelations;
  onAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState(draft.caption);
  const [showHistory, setShowHistory] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  function handleApprove() {
    startTransition(async () => {
      await approveDraft(draft.id);
      toast.success("Draft approved. Schedule it from the Approved tab.");
      onAction();
    });
  }

  function handleReject() {
    setConfirmReject(false);
    startTransition(async () => {
      await rejectDraft(draft.id, "Rejected from review queue");
      toast.success("Draft rejected.");
      onAction();
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
      await duplicateDraft(draft.id);
      toast.success("Duplicated. Find the copy in the In Review tab.");
      onAction();
    });
  }

  function handleRewrite(directive: string) {
    startTransition(async () => {
      await rewriteDraftAction({
        draftId: draft.id,
        directive:
          directive as Parameters<typeof rewriteDraftAction>[0]["directive"],
      });
      toast.success("Rewrite applied. Review the updated caption.");
      onAction();
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      await updateDraftCaption(draft.id, editedCaption);
      setEditingCaption(false);
      toast.success("Caption updated.");
      onAction();
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
        open={confirmReject}
        title="Reject this draft?"
        description="The draft will be moved to Rejected status. You can duplicate it first if you want to keep a copy."
        confirmLabel="Reject"
        confirmVariant="destructive"
        onConfirm={handleReject}
        onCancel={() => setConfirmReject(false)}
        isPending={isPending}
      />
      <ConfirmDialog
        open={confirmArchive}
        title="Archive this draft?"
        description="The draft will be removed from the active queue. You can still find it in the Published Posts section if it was previously live."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
        isPending={isPending}
      />

      <Card
        className={
          draft.status === "APPROVED" ? "border-emerald-600/30" : ""
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
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
            {draft.status === "IN_REVIEW" && (
              <Button
                size="sm"
                onClick={handleApprove}
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
              disabled={isPending}
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

            {draft.status === "IN_REVIEW" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmReject(true)}
                disabled={isPending}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-600/10"
                title="Reject draft"
              >
                <X className="h-3.5 w-3.5" />
                <span className="ml-1">Reject</span>
              </Button>
            )}

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

  const inReview = drafts.filter((d) => d.status === "IN_REVIEW");
  const approved = drafts.filter((d) => d.status === "APPROVED");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Badge variant="warning">{inReview.length} in review</Badge>
          <Badge variant="success">{approved.length} approved</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          All content must be approved before scheduling.
        </p>
      </div>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">
            Needs Review ({inReview.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved — Ready to Schedule ({approved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4">
          {inReview.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Queue is clear"
              description="No drafts waiting for review. Generate content in the Content Studio."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {inReview.map((draft) => (
                <DraftCard key={draft.id} draft={draft} onAction={refresh} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          {approved.length === 0 ? (
            <EmptyState
              icon={Check}
              title="No approved drafts"
              description="Approve drafts from the In Review tab, then schedule them here."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {approved.map((draft) => (
                <DraftCard key={draft.id} draft={draft} onAction={refresh} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
