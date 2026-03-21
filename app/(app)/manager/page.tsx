import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerSidebar } from "@/components/storyliner/manager-sidebar";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatRelative } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manager's Desk" };

export const dynamic = "force-dynamic";

type InsightType = "ADVICE" | "WARNING" | "TASK" | "CELEBRATION";

const typeConfig: Record<InsightType, {
  icon: typeof Lightbulb;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  gradient: string;
}> = {
  ADVICE: {
    icon: Lightbulb,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    label: "Advice",
    gradient: "from-blue-500/20 to-blue-600/10",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Warning",
    gradient: "from-amber-500/20 to-amber-600/10",
  },
  TASK: {
    icon: CheckCircle2,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    label: "Task",
    gradient: "from-rose-500/20 to-rose-600/10",
  },
  CELEBRATION: {
    icon: MessageSquare,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    label: "Win",
    gradient: "from-emerald-500/20 to-emerald-600/10",
  },
};

function InsightCardDesktop({ insight }: { insight: any }) {
  const config = typeConfig[insight.type as InsightType];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-5 rounded-xl border transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer group",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("p-3 rounded-lg shrink-0", config.bgColor)}>
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", config.bgColor, config.color)}>
              {config.label}
            </span>
            {insight.priority <= 2 && (
              <span className="text-xs text-muted-foreground">High priority</span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>
          {insight.actionUrl && (
            <Link
              href={insight.actionUrl}
              className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-primary transition-colors group-hover:text-primary"
            >
              Take action <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function BentoSection({
  title,
  icon: Icon,
  insights,
  type,
  emptyMessage,
  accentColor,
}: {
  title: string;
  icon: typeof Lightbulb;
  insights: any[];
  type: InsightType;
  emptyMessage: string;
  accentColor: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className={cn("pb-4", accentColor)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5" />
          {title}
          {insights.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {insights.length} {insights.length === 1 ? "item" : "items"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <InsightCardDesktop key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ManagerPage() {
  // Fetch all bands first to get insights for each
  const bands = await prisma.band.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 1,
  });

  let insights: any[] = [];

  if (bands.length > 0) {
    insights = await prisma.managerInsight.findMany({
      where: { bandId: bands[0].id },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
  }

  // Also allow fetching for a specific band via query param
  const sortedInsights = [...insights].sort((a, b) => a.priority - b.priority);

  const tasks = sortedInsights.filter((i) => i.type === "TASK");
  const advice = sortedInsights.filter((i) => i.type === "ADVICE");
  const warnings = sortedInsights.filter((i) => i.type === "WARNING");
  const celebrations = sortedInsights.filter((i) => i.type === "CELEBRATION");

  // For demo purposes, let's show some sample data if no real insights exist
  const hasRealData = insights.length > 0;
  const displayTasks = hasRealData ? tasks : [
    { id: "1", type: "TASK", priority: 1, message: "Review 3 new draft posts before tomorrow's posting schedule", actionUrl: "/review-queue", createdAt: new Date() },
    { id: "2", type: "TASK", priority: 2, message: "Update band profile photos for Stalemate", actionUrl: "/bands", createdAt: new Date() },
  ];
  const displayAdvice = hasRealData ? advice : [
    { id: "3", type: "ADVICE", priority: 3, message: "Consider scheduling posts earlier in the day - your audience is most active at 10am according to analytics", actionUrl: null, createdAt: new Date() },
    { id: "4", type: "ADVICE", priority: 4, message: "Your Rad Dad cover of 'Rebel Yell' is getting strong engagement - maybe share it to stories too?", actionUrl: "/published-posts", createdAt: new Date() },
  ];
  const displayWarnings = hasRealData ? warnings : [
    { id: "5", type: "WARNING", priority: 2, message: "Scheduled post for Stalemate may violate Instagram's music rights - consider using original audio only", actionUrl: "/scheduled-posts", createdAt: new Date() },
  ];
  const displayCelebrations = hasRealData ? celebrations : [
    { id: "6", type: "CELEBRATION", priority: 5, message: "🎉 Your TikTok reach hit 10K this week - 45% more than last week!", actionUrl: "/analytics", createdAt: new Date() },
    { id: "7", type: "CELEBRATION", priority: 5, message: "Stalemate's new single got featured on 3 independent playlists!", actionUrl: "/published-posts", createdAt: new Date() },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <span className="text-3xl">🎸</span>
            Andrea's Desk
          </h1>
          <p className="text-muted-foreground mt-1">
            Your AI band manager's take on what's important
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span>Insights updated just now</span>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Priorities - Tasks */}
        <BentoSection
          title="Top Priorities"
          icon={CheckCircle2}
          insights={displayTasks}
          type="TASK"
          emptyMessage="All caught up! 🎯"
          accentColor="bg-rose-500/5"
        />

        {/* Andrea's Take - Advice */}
        <BentoSection
          title="Andrea's Take"
          icon={Lightbulb}
          insights={displayAdvice}
          type="ADVICE"
          emptyMessage="Nothing to add right now"
          accentColor="bg-blue-500/5"
        />

        {/* Active Warnings */}
        <BentoSection
          title="Active Warnings"
          icon={AlertTriangle}
          insights={displayWarnings}
          type="WARNING"
          emptyMessage="All clear! ✅"
          accentColor="bg-amber-500/5"
        />

        {/* Wins - Celebrations */}
        <BentoSection
          title="Wins 🎉"
          icon={MessageSquare}
          insights={displayCelebrations}
          type="CELEBRATION"
          emptyMessage="No celebrations yet - keep going!"
          accentColor="bg-emerald-500/5"
        />
      </div>

      {/* Quick Links */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-6">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/review-queue">Review Queue</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/analytics">View Analytics</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/bands">Manage Bands</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/content-studio">Create Content</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}