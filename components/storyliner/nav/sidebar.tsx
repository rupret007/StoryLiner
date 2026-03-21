"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Music2,
  Pen,
  Megaphone,
  Calendar,
  ClipboardList,
  Clock,
  CheckCircle2,
  Radio,
  BarChart3,
  Settings,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, Suspense } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BandSwitcher } from "@/components/storyliner/band-switcher";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bands", label: "Bands", icon: Music2 },
  { href: "/content-studio", label: "Content Studio", icon: Pen },
  { href: "/campaign-builder", label: "Campaigns", icon: Megaphone },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { type: "separator" as const, label: "Queue" },
  { href: "/review-queue", label: "Review Queue", icon: ClipboardList },
  { href: "/scheduled-posts", label: "Scheduled", icon: Clock },
  { href: "/published-posts", label: "Published", icon: CheckCircle2 },
  { type: "separator" as const, label: "Streams" },
  { href: "/livestreams", label: "Livestreams", icon: Radio },
  { type: "separator" as const, label: "Insights" },
  { href: "/manager", label: "Manager's Desk", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { type: "separator" as const, label: "Config" },
  { href: "/integrations", label: "Integrations", icon: Puzzle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ 
  bands = [], 
  activeBandId,
  isCollapsed = false
}: { 
  bands?: any[]; 
  activeBandId?: string; 
  isCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(isCollapsed);

  const toggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    // Persist the collapsed state in a cookie
    document.cookie = `sidebarCollapsed=${newState}; path=/; max-age=31536000`;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-200 ease-in-out",
          collapsed ? "w-14" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-sidebar-border h-14 px-4 shrink-0",
          collapsed ? "justify-center" : "gap-2"
        )}>
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Radio className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-sm text-sidebar-foreground tracking-tight">
              StoryLiner
            </span>
          )}
        </div>

        {/* Band Switcher */}
        {!collapsed && (
          <div className="px-2 py-3 border-b border-sidebar-border">
            <Suspense fallback={<div className="h-8 w-full bg-muted animate-pulse rounded-md" />}>
              <BandSwitcher bands={bands} activeBandId={activeBandId} />
            </Suspense>
          </div>
        )}

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-0.5 px-2">
            {navItems.map((item, i) => {
              if (item.type === "separator") {
                if (collapsed) return null;
                return (
                  <p
                    key={i}
                    className="mt-4 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50"
                  >
                    {item.label}
                  </p>
                );
              }

              const Icon = item.icon!;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard" || pathname === "/"
                  : pathname.startsWith(item.href!);

              const linkEl = (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                    collapsed ? "justify-center" : "",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return linkEl;
            })}
          </nav>
        </ScrollArea>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
