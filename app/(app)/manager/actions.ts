"use server";

import { prisma } from "@/lib/prisma";
import { InsightEngine } from "@/lib/services/manager/insight-engine";
import { revalidatePath } from "next/cache";

export async function refreshInsightsAction(bandId: string) {
  try {
    const engine = new InsightEngine();
    await engine.generateInsights(bandId);
    
    revalidatePath("/manager");
    return { success: true };
  } catch (err) {
    console.error("Failed to refresh insights:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function markInsightAsReadAction(insightId: string) {
  try {
    await prisma.managerInsight.update({
      where: { id: insightId },
      data: { isRead: true },
    });
    
    revalidatePath("/manager");
    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to mark as read" };
  }
}
