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
import { reschedulePost } from "@/app/(app)/review-queue/actions";

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
    new Date(currentScheduledFor).toISOString().slice(0, 16)
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
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setNewTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Must be in the future.</p>
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
