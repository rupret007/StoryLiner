import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: string; positive: boolean };
  color?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  color,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {color && (
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundColor: color }}
        />
      )}
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {trend && (
              <p
                className={cn(
                  "text-xs",
                  trend.positive ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {trend.positive ? "+" : ""}{trend.value}
              </p>
            )}
          </div>
          {Icon && (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
              style={
                color
                  ? { backgroundColor: `${color}22`, color }
                  : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            >
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
