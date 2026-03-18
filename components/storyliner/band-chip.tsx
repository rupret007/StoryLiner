import { cn } from "@/lib/utils";

interface BandChipProps {
  name: string;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function BandChip({ name, color = "#6d28d9", size = "sm", className }: BandChipProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
      style={{
        backgroundColor: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
      }}
    >
      <span
        className={cn(
          "rounded-full flex items-center justify-center font-bold",
          size === "sm" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]"
        )}
        style={{ backgroundColor: color }}
      >
        <span className="text-white">{initials}</span>
      </span>
      {name}
    </div>
  );
}
