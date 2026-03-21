"use client";

import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { refreshInsightsAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function RefreshInsightsButton({ bandId }: { bandId: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshInsightsAction(bandId);
      if (result.success) {
        toast.success("Insights updated");
        router.refresh();
      } else {
        toast.error("Failed to update: " + result.error);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-12 w-12 rounded-xl"
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
    </Button>
  );
}
