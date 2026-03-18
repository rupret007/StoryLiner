"use client";

import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bands": "Bands",
  "/content-studio": "Content Studio",
  "/campaign-builder": "Campaign Builder",
  "/calendar": "Calendar",
  "/review-queue": "Review Queue",
  "/scheduled-posts": "Scheduled Posts",
  "/published-posts": "Published Posts",
  "/livestreams": "Livestreams",
  "/analytics": "Analytics",
  "/integrations": "Integrations",
  "/settings": "Settings",
};

function getTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  for (const [key, val] of Object.entries(routeTitles)) {
    if (pathname.startsWith(key)) return val;
  }
  return "StoryLiner";
}

interface TopbarProps {
  reviewCount?: number;
}

export function Topbar({ reviewCount = 0 }: TopbarProps) {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
      <h1 className="text-base font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="relative h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link href="/review-queue" title="Review Queue">
            <ClipboardList className="h-4 w-4" />
            {reviewCount > 0 ? (
              <>
                <span>Review</span>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {reviewCount > 9 ? "9+" : reviewCount}
                </span>
              </>
            ) : (
              <span>Review</span>
            )}
          </Link>
        </Button>
      </div>
    </header>
  );
}
