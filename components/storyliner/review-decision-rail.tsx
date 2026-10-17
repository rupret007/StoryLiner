"use client";

import type { ReactNode } from "react";
import { CalendarClock, Check, Loader2, Pause, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ReviewDecision,
  ReviewDecisionId,
  ReviewDecisionRailView,
} from "@/lib/services/publish/review-decision";

const ICONS: Record<ReviewDecisionId, typeof Check> = {
  approve: Check,
  hold: Pause,
  deny: X,
  resume: Undo2,
  schedule: CalendarClock,
};

function decisionButtonClass(decision: ReviewDecision): string {
  if (decision.id === "approve") {
    return "bg-emerald-600 hover:bg-emerald-700 text-white";
  }
  if (decision.id === "schedule") {
    return "bg-blue-600 hover:bg-blue-700 text-white";
  }
  if (decision.id === "deny") {
    return "text-rose-400 hover:text-rose-300 hover:bg-rose-600/10";
  }
  return "";
}

function decisionVariant(
  decision: ReviewDecision
): "default" | "outline" | "ghost" {
  if (decision.tone === "primary") return "default";
  if (decision.tone === "destructive") return "ghost";
  return "outline";
}

export function ReviewDecisionRail({
  rail,
  pending,
  blocked = false,
  onDecision,
  scheduleForm,
}: {
  rail: ReviewDecisionRailView;
  pending: boolean;
  blocked?: boolean;
  onDecision: (id: ReviewDecisionId) => void;
  scheduleForm?: ReactNode;
}) {
  return (
    <section aria-label="Review decisions" className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Decide
      </p>
      <p className="text-[11px] text-muted-foreground">{rail.heading}</p>
      {rail.decisions.length > 0 && (
        <ol className="flex flex-wrap gap-2">
          {rail.decisions.map((decision) => {
            const Icon = ICONS[decision.id];
            const consequenceId = `review-decision-${decision.id}-consequence`;
            const inline = decision.presentation === "inline" && scheduleForm;

            return (
              <li
                key={decision.id}
                data-decision={decision.id}
                data-next-yes={decision.nextYes ? "true" : "false"}
                className={cn(
                  "rounded-md border p-2 space-y-2",
                  inline ? "min-w-[16rem] flex-[2]" : "min-w-[9.5rem] flex-1",
                  decision.nextYes
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-muted/10"
                )}
              >
                {decision.nextYes && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
                    Next yes
                  </p>
                )}
                {inline ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-blue-300" />
                      <p className="text-sm font-medium text-foreground">
                        {decision.label}
                      </p>
                    </div>
                    <p
                      id={consequenceId}
                      className="text-[11px] text-muted-foreground"
                    >
                      {decision.consequence}
                    </p>
                    {scheduleForm}
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant={decisionVariant(decision)}
                      className={decisionButtonClass(decision)}
                      disabled={pending || blocked}
                      aria-describedby={consequenceId}
                      onClick={() => onDecision(decision.id)}
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                      {decision.label}
                    </Button>
                    <p
                      id={consequenceId}
                      className="text-[11px] text-muted-foreground leading-snug"
                    >
                      {decision.consequence}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
