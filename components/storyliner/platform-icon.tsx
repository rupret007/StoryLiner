import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/utils";

const platformColors: Record<string, string> = {
  FACEBOOK: "#1877F2",
  INSTAGRAM: "#E1306C",
  BLUESKY: "#0085FF",
  TIKTOK: "#000000",
  YOUTUBE: "#FF0000",
  TWITCH: "#9146FF",
  TWITTER: "#1DA1F2",
};

const platformEmoji: Record<string, string> = {
  FACEBOOK: "f",
  INSTAGRAM: "ig",
  BLUESKY: "bsky",
  TIKTOK: "tt",
  YOUTUBE: "yt",
  TWITCH: "tw",
  TWITTER: "x",
};

interface PlatformIconProps {
  platform: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlatformIcon({
  platform,
  showLabel = false,
  size = "sm",
  className,
}: PlatformIconProps) {
  const color = platformColors[platform] ?? "#666";
  const abbr = platformEmoji[platform] ?? platform.slice(0, 2).toLowerCase();

  const sizeClasses = {
    sm: "h-5 w-5 text-[9px]",
    md: "h-6 w-6 text-[10px]",
    lg: "h-8 w-8 text-xs",
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <div
        className={cn(
          "rounded flex items-center justify-center font-bold text-white shrink-0",
          sizeClasses[size]
        )}
        style={{ backgroundColor: color }}
        title={platformLabel(platform)}
      >
        {abbr}
      </div>
      {showLabel && (
        <span className="text-sm text-muted-foreground">
          {platformLabel(platform)}
        </span>
      )}
    </div>
  );
}
