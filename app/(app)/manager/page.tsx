import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Metadata } from "next";
import { InsightEngine } from "@/lib/services/manager/insight-engine";
import { RefreshInsightsButton } from "./refresh-button";

export const metadata: Metadata = { title: "Manager's Desk" };

export const dynamic = "force-dynamic";

type InsightType = "ADVICE" | "WARNING" | "TASK" | "CELEBRATION";

const typeConfig: Record<InsightType, {
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  ADVICE: {
    icon: Lightbulb,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    label: "Advice",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Warning",
  },
  TASK: {
    icon: CheckCircle2,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    label: "Task",
  },
  CELEBRATION: {
    icon: MessageSquare,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    label: "Win",
  },
};

function InsightCardDesktop({ insight }: { insight: any }) {
  const config = typeConfig[insight.type as InsightType];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-5 rounded-xl border transition-all hover:scale-[1.01] hover:shadow-md group",
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
            <span className={cn("text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded", config.bgColor, config.color)}>
              {config.label}
            </span>
            {insight.priority <= 2 && (
              <span className="text-[10px] text-muted-foreground uppercase font-medium">High priority</span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>
          {insight.actionUrl && (
            <Link
              href={insight.actionUrl}
              className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-primary transition-colors group-hover:text-primary font-medium"
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
  emptyMessage,
  accentColor,
}: {
  title: string;
  icon: any;
  insights: any[];
  emptyMessage: string;
  accentColor: string;
}) {
  return (
    <Card className="overflow-hidden border-none bg-secondary/30 shadow-none">
      <CardHeader className={cn("pb-4 border-b border-border/50", accentColor)}>
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
          <Icon className="h-4 w-4" />
          {title}
          {insights.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full">
              {insights.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {insights.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-4">
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
  // Fetch active band
  const band = await prisma.band.findFirst({
    where: { isActive: true },
    include: { voiceProfile: true },
  });

  if (!band) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-bold font-black tracking-tighter">No active band found</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Andrea needs a band to manage. Create your first band profile to unlock the Manager's Desk.
        </p>
        <Button className="mt-8 px-8 rounded-full font-bold" asChild>
          <Link href="/bands">Get Started</Link>
        </Button>
      </div>
    );
  }

  // Trigger a refresh (passive logic)
  try {
    const engine = new InsightEngine();
    await engine.generateInsights(band.id);
  } catch (err) {
    console.error("Silent background refresh failed:", err);
  }

  // Fetch real insights
  const insights = await prisma.managerInsight.findMany({
    where: { bandId: band.id, isRead: false },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  const tasks = insights.filter((i) => i.type === "TASK");
  const advice = insights.filter((i) => i.type === "ADVICE");
  const warnings = insights.filter((i) => i.type === "WARNING");
  const celebrations = insights.filter((i) => i.type === "CELEBRATION");

  return (
    <div className="max-w-6xl mx-auto space-y-10 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Live Management Active
          </div>
          <h1 className="text-5xl font-black text-foreground tracking-tighter flex items-center gap-3">
            Andrea's Desk
          </h1>
          <p className="text-muted-foreground text-lg mt-2 max-w-xl">
            Proactive strategy and tasks for <span className="text-foreground font-bold">{band.name}</span>.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block border-r border-border pr-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</p>
            <p className="text-sm font-medium text-emerald-400">Masterclass Mode</p>
          </div>
          <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Priorities - Tasks */}
        <BentoSection
          title="Top Priorities"
          icon={CheckCircle2}
          insights={tasks}
          emptyMessage="All caught up! 🎯"
          accentColor="text-rose-400"
        />

        {/* Andrea's Take - Advice */}
        <BentoSection
          title="Andrea's Take"
          icon={Lightbulb}
          insights={advice}
          emptyMessage="No new advice right now"
          accentColor="text-blue-400"
        />

        {/* Active Warnings */}
        <BentoSection
          title="Active Warnings"
          icon={AlertTriangle}
          insights={warnings}
          emptyMessage="All systems clear! ✅"
          accentColor="text-amber-400"
        />

        {/* Wins - Celebrations */}
        <BentoSection
          title="Wins & Milestones"
          icon={MessageSquare}
          insights={celebrations}
          emptyMessage="Doing the work. Keep it up!"
          accentColor="text-emerald-400"
        />
      </div>

      {/* Action Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-10 border-t border-border/50">
        <Link href="/content-studio" className="group p-8 rounded-3xl bg-secondary/10 border border-border/50 hover:bg-primary/5 hover:border-primary/20 transition-all">
          <h3 className="font-black text-xl mb-2 tracking-tight group-hover:text-primary transition-colors">Content Studio</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Draft new posts using your band's custom voice profile and platform rules.</p>
          <span className="text-xs font-bold text-primary flex items-center gap-1">Generate content <ArrowRight className="h-3 w-3" /></span>
        </Link>
        <Link href="/analytics" className="group p-8 rounded-3xl bg-secondary/10 border border-border/50 hover:bg-blue-500/5 hover:border-blue-500/20 transition-all">
          <h3 className="font-black text-xl mb-2 tracking-tight group-hover:text-blue-400 transition-colors">Performance</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">See which posts are landing and where the crowd is moving this week.</p>
          <span className="text-xs font-bold text-blue-400 flex items-center gap-1">View analytics <ArrowRight className="h-3 w-3" /></span>
        </Link>
        <Link href={`/bands/${band.id}`} className="group p-8 rounded-3xl bg-secondary/10 border border-border/50 hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all">
          <h3 className="font-black text-xl mb-2 tracking-tight group-hover:text-emerald-400 transition-colors">The Lab</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Fine-tune your voice rules, tone parameters, and platform-specific notes.</p>
          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">Edit profile <ArrowRight className="h-3 w-3" /></span>
        </Link>
      </div>
    </div>
  );
}