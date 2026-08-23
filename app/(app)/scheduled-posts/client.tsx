"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CalendarClock, Loader2 } from "lucide-react";
import { formatDatetimeLocalValue } from "@/lib/utils";
import {
  returnScheduleButtonLabel,
  returnScheduleSuccessToast,
} from "@/lib/services/publish/safety";
import {
  reschedulePost,
  returnScheduleToApproved,
} from "@/app/(app)/review-queue/actions";

interface RescheduleButtonProps {
  scheduledPostId: string;
  currentScheduledFor: Date;
}

export function RescheduleButton({
  scheduledPostId,
  currentScheduledFor,
}: RescheduleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [newTime, setNewTime] = useState(
    formatDatetimeLocalValue(new Date(currentScheduledFor))
  );

  function handleReschedule() {
    startTransition(async () => {
      try {
        await reschedulePost(scheduledPostId, new Date(newTime).toISOString());
        toast.success("Post rescheduled.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reschedule failed.");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock className="h-3.5 w-3.5" />
        Reschedule
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New Schedule Time</Label>
            <Input
              type="datetime-local"
              value={newTime}
              min={formatDatetimeLocalValue(new Date())}
              onChange={(e) => setNewTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Must be in the future. This does not publish.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={isPending || !newTime}>
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Reschedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReturnScheduleButton({
  scheduledPostId,
  jobStatus,
  adapterWriteStarted,
}: {
  scheduledPostId: string;
  jobStatus: string | null;
  adapterWriteStarted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkedPlatform, setCheckedPlatform] = useState(false);

  const label = returnScheduleButtonLabel({
    jobStatus,
    adapterWriteStarted,
  });

  function submit(confirmCheckedPlatform: boolean) {
    startTransition(async () => {
      try {
        await returnScheduleToApproved(scheduledPostId, confirmCheckedPlatform);
        toast.success(
          returnScheduleSuccessToast({
            jobStatus,
            adapterWriteStarted,
          })
        );
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not return to Approved.");
      }
    });
  }

  function handleClick() {
    if (adapterWriteStarted) {
      setCheckedPlatform(false);
      setConfirmOpen(true);
      return;
    }
    submit(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : label}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Check the platform first</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A live write may have already reached Facebook / Instagram / YouTube.
            Returning to Approved does not publish, but scheduling again without
            checking can double-post.
          </p>
          <label className="flex items-start gap-2 text-xs text-amber-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checkedPlatform}
              onChange={(e) => setCheckedPlatform(e.target.checked)}
            />
            I checked the platform. No live post. Return to Approved is not publish.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => submit(true)}
              disabled={isPending || !checkedPlatform}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Return to Approved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Use ReturnScheduleButton. Fail-closed: require a platform check. */
export function ReturnFailedScheduleButton({
  scheduledPostId,
}: {
  scheduledPostId: string;
}) {
  return (
    <ReturnScheduleButton
      scheduledPostId={scheduledPostId}
      jobStatus="FAILED"
      adapterWriteStarted={true}
    />
  );
}
