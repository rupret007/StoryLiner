"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, MessageSquare, Lightbulb, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type ManagerInsight = {
  id: string;
  type: "ADVICE" | "WARNING" | "TASK" | "CELEBRATION";
  priority: number;
  message: string;
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: Date;
};

interface ManagerSidebarProps {
  insights: ManagerInsight[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const typeConfig = {
  ADVICE: {
    icon: Lightbulb,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    label: "Advice",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    label: "Warning",
  },
  TASK: {
    icon: CheckCircle2,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
    label: "Task",
  },
  CELEBRATION: {
    icon: MessageSquare,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    label: "Win",
  },
};

function InsightCard({ insight }: { insight: ManagerInsight }) {
  const config = typeConfig[insight.type as keyof typeof typeConfig];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-colors hover:bg-accent/50",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-md shrink-0", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>
          {insight.actionUrl && (
            <Link
              href={insight.actionUrl}
              className="inline-flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Take action <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsList({ insights, title, emptyMessage }: {
  insights: ManagerInsight[];
  title: string;
  emptyMessage: string;
}) {
  if (insights.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

export function ManagerSidebar({ insights, trigger, open, onOpenChange }: ManagerSidebarProps) {
  const unreadCount = insights.filter((i) => !i.isRead).length;

  // Sort by priority (lower number = higher priority)
  const sortedInsights = [...insights].sort((a, b) => a.priority - b.priority);

  // Group by type
  const tasks = sortedInsights.filter((i) => i.type === "TASK");
  const advice = sortedInsights.filter((i) => i.type === "ADVICE");
  const warnings = sortedInsights.filter((i) => i.type === "WARNING");
  const celebrations = sortedInsights.filter((i) => i.type === "CELEBRATION");

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="relative h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <Bell className="h-4 w-4" />
      <span>Manager</span>
      {unreadCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger || defaultTrigger}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Manager Insights
            </SheetTitle>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} unread
              </span>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {insights.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No insights yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Andrea will surface important items here
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {tasks.length > 0 && (
                <InsightsList
                  insights={tasks}
                  title="Top Priorities"
                  emptyMessage="No pending tasks"
                />
              )}
              {advice.length > 0 && (
                <InsightsList
                  insights={advice}
                  title="Andrea's Take"
                  emptyMessage="No advice right now"
                />
              )}
              {warnings.length > 0 && (
                <InsightsList
                  insights={warnings}
                  title="Active Warnings"
                  emptyMessage="All clear"
                />
              )}
              {celebrations.length > 0 && (
                <InsightsList
                  insights={celebrations}
                  title="Wins"
                  emptyMessage="No celebrations yet"
                />
              )}
            </div>
          )}
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/manager">
              Open Manager's Desk
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}