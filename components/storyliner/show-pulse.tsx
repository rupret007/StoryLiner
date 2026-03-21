"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShowPulseProps {
  bandName: string;
  hasUpcomingShowToday?: boolean;
  isStreamingNow?: boolean;
}

export function ShowPulse({ bandName, hasUpcomingShowToday, isStreamingNow }: ShowPulseProps) {
  const [pulseColor, setPulseColor] = useState("bg-primary");
  const [statusText, setStatusText] = useState("Live Management Active");

  useEffect(() => {
    if (isStreamingNow) {
      setPulseColor("bg-rose-500");
      setStatusText(`${bandName} is LIVE NOW`);
    } else if (hasUpcomingShowToday) {
      setPulseColor("bg-amber-500");
      setStatusText(`Show Day: ${bandName} performs tonight`);
    } else {
      setPulseColor("bg-emerald-500");
      setStatusText(`Standby: ${bandName} is in the lab`);
    }
  }, [isStreamingNow, hasUpcomingShowToday, bandName]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 backdrop-blur-sm">
      <div className="relative flex h-3 w-3">
        <span className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
          pulseColor
        )}></span>
        <span className={cn(
          "relative inline-flex rounded-full h-3 w-3",
          pulseColor
        )}></span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 leading-none">
          Show Pulse
        </span>
        <span className="text-xs font-bold text-foreground mt-0.5">
          {statusText}
        </span>
      </div>
    </div>
  );
}
