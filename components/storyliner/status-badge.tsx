import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ARCHIVED";

const statusConfig: Record<
  Status,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  IN_REVIEW: { label: "In Review", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  PUBLISHED: { label: "Published", variant: "success" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as Status] ?? {
    label: status,
    variant: "secondary" as const,
  };

  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  );
}
