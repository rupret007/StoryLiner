import type { AnalyticsSnapshot, Platform, CampaignType, ToneVariant } from "@prisma/client";
import { platformLabel, campaignTypeLabel } from "@/lib/utils";

export interface PatternInsight {
  label: string;
  value: string;
  reason: string;
  isPositive: boolean;
  confidence: "low" | "medium" | "high";
}

export interface TimingRecommendation {
  platform: Platform;
  bestDays: string[];
  bestHours: string[];
  reason: string;
}

export interface AnalyticsReport {
  bestPatterns: PatternInsight[];
  weakPatterns: PatternInsight[];
  timingRecommendations: TimingRecommendation[];
  contentTypeRecommendations: PatternInsight[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function buildAnalyticsReport(snapshots: AnalyticsSnapshot[]): AnalyticsReport {
  if (snapshots.length === 0) {
    return {
      bestPatterns: [],
      weakPatterns: [],
      timingRecommendations: [],
      contentTypeRecommendations: [],
    };
  }

  const bestPatterns: PatternInsight[] = [];
  const weakPatterns: PatternInsight[] = [];

  // Best campaign types by engagement rate
  const byCampaignType = groupBy(snapshots.filter((s) => s.campaignType), (s) => s.campaignType!);
  const campaignTypeEngagement = Object.entries(byCampaignType).map(([type, snaps]) => ({
    type: type as CampaignType,
    avgEngagement: avg(snaps.map((s) => s.engagementRate)),
    count: snaps.length,
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  if (campaignTypeEngagement.length > 0) {
    const best = campaignTypeEngagement[0];
    if (best.count >= 2) {
      bestPatterns.push({
        label: "Best Campaign Type",
        value: campaignTypeLabel(best.type),
        reason: `${best.count} posts with avg ${(best.avgEngagement * 100).toFixed(1)}% engagement rate. Heuristic: higher sample size = more reliable.`,
        isPositive: true,
        confidence: best.count >= 5 ? "high" : "medium",
      });
    }

    const worst = campaignTypeEngagement[campaignTypeEngagement.length - 1];
    if (worst.count >= 2 && worst.avgEngagement < 0.02) {
      weakPatterns.push({
        label: "Weak Campaign Type",
        value: campaignTypeLabel(worst.type),
        reason: `Only ${(worst.avgEngagement * 100).toFixed(1)}% avg engagement across ${worst.count} posts. Consider different approach or timing.`,
        isPositive: false,
        confidence: worst.count >= 5 ? "high" : "medium",
      });
    }
  }

  // Best tone variants
  const byTone = groupBy(snapshots.filter((s) => s.toneVariant), (s) => s.toneVariant!);
  const toneEngagement = Object.entries(byTone).map(([tone, snaps]) => ({
    tone: tone as ToneVariant,
    avgEngagement: avg(snaps.map((s) => s.engagementRate)),
    count: snaps.length,
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  if (toneEngagement.length > 0 && toneEngagement[0].count >= 2) {
    const best = toneEngagement[0];
    bestPatterns.push({
      label: "Best Performing Tone",
      value: best.tone.charAt(0) + best.tone.slice(1).toLowerCase(),
      reason: `${(best.avgEngagement * 100).toFixed(1)}% avg engagement across ${best.count} posts. More data needed for certainty.`,
      isPositive: true,
      confidence: best.count >= 5 ? "medium" : "low",
    });
  }

  // Timing recommendations by platform
  const byPlatform = groupBy(snapshots, (s) => s.platform);
  const timingRecommendations: TimingRecommendation[] = Object.entries(byPlatform).map(([platform, snaps]) => {
    const byDay = groupBy(snaps, (s) => String(s.dayOfWeek));
    const dayRanking = Object.entries(byDay).map(([day, s]) => ({
      day: parseInt(day),
      avg: avg(s.map((x) => x.engagementRate)),
    })).sort((a, b) => b.avg - a.avg);

    const byHour = groupBy(snaps, (s) => String(s.hourOfDay));
    const hourRanking = Object.entries(byHour).map(([hour, s]) => ({
      hour: parseInt(hour),
      avg: avg(s.map((x) => x.engagementRate)),
    })).sort((a, b) => b.avg - a.avg);

    return {
      platform: platform as Platform,
      bestDays: dayRanking.slice(0, 2).map((d) => DAY_NAMES[d.day]),
      bestHours: hourRanking.slice(0, 2).map((h) => {
        const hour = h.hour;
        return hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`;
      }),
      reason: `Based on ${snaps.length} posts. Heuristic: posting when past engagement was highest. Low confidence below 10 posts.`,
    };
  });

  // Content type recommendations
  const contentTypeRecommendations: PatternInsight[] = [];
  if (campaignTypeEngagement.length > 0) {
    const toTry: PatternInsight[] = campaignTypeEngagement.slice(0, 2).map((c) => ({
      label: "Recommended Next Campaign Type",
      value: campaignTypeLabel(c.type),
      reason: `Historically strong for this band. ${c.count} data points.`,
      isPositive: true,
      confidence: (c.count >= 5 ? "high" : "medium") as "low" | "medium" | "high",
    }));
    contentTypeRecommendations.push(...toTry);
  }

  return {
    bestPatterns,
    weakPatterns,
    timingRecommendations,
    contentTypeRecommendations,
  };
}
