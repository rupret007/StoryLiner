import { cn } from "@/lib/utils";
import {
  PROMO_PIPELINE_PATH,
  promoPipelineSteps,
  type PromoPipelineStepView,
} from "@/lib/services/publish/review-desk";

function stepClass(step: PromoPipelineStepView) {
  switch (step.state) {
    case "done":
      return "border-emerald-600/40 bg-emerald-950/30 text-emerald-200";
    case "current":
      return "border-primary bg-primary/15 text-foreground";
    case "off":
      return "border-border/60 bg-muted/20 text-muted-foreground/70";
    default:
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

export function PromoPipeline({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const steps = promoPipelineSteps(status ?? "IN_REVIEW");

  return (
    <nav
      aria-label={PROMO_PIPELINE_PATH}
      className={cn("space-y-2", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-muted-foreground text-xs">
                →
              </span>
            )}
            <span
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium",
                stepClass(step)
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        Publish is the worker after a scheduled job is due. This page never
        auto-publishes.
      </p>
    </nav>
  );
}
