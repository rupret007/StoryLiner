import { prisma } from "@/lib/prisma";
import { getLlmAdapter } from "@/lib/services/llm";
import type { Band, BandVoiceProfile, Platform } from "@prisma/client";

export type InsightType = "ADVICE" | "WARNING" | "TASK" | "CELEBRATION";

/**
 * The Insight Engine is responsible for scanning the database and
 * generating proactive advice and tasks for the band manager (Andrea).
 */
export class InsightEngine {
  /**
   * Run a full sweep for a specific band and generate insights.
   * This is intended to be called periodically (e.g. by a background worker)
   * or when the user visits the manager page.
   */
  async generateInsights(bandId: string) {
    const band = await prisma.band.findUnique({
      where: { id: bandId },
      include: {
        voiceProfile: true,
        drafts: {
          where: { status: "IN_REVIEW" },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        events: {
          where: {
            eventDate: { gte: new Date() },
            isCancelled: false,
          },
          orderBy: { eventDate: "asc" },
          take: 3,
        },
        publishedPosts: {
          orderBy: { publishedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!band) return;

    // 1. Check for review backlog
    await this.checkReviewBacklog(band);

    // 2. Check for upcoming shows without content
    await this.checkUpcomingShows(band);

    // 3. Check for performance wins
    await this.checkPerformanceWins(band);

    // 4. Check for posting frequency
    await this.checkPostingFrequency(band);

    // 5. Advanced LLM Strategy
    await this.generateAdvancedAdvice(band);
  }

  private async generateAdvancedAdvice(band: any) {
    // Only run this occasionally to avoid token burn
    // Check if we've generated an ADVICE insight in the last 24 hours
    const recentAdvice = await prisma.managerInsight.findFirst({
      where: {
        bandId: band.id,
        type: "ADVICE",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (recentAdvice) return;

    try {
      const llm = getLlmAdapter();
      
      const context = {
        recentPosts: band.publishedPosts.map((p: any) => ({
          platform: p.platform,
          caption: p.caption.slice(0, 100),
          likes: p.likes,
        })),
        upcomingEvents: band.events.map((e: any) => ({
          title: e.title,
          date: e.eventDate,
          venue: e.venue,
        })),
      };

      // Ask Andrea (the LLM) for a strategy nugget
      const prompts = await llm.generateEngagementPrompts({
        bandName: band.name,
        platform: "FACEBOOK", // Default to FB for general strategy
      });

      if (prompts && prompts.length > 0) {
        await this.createInsight({
          bandId: band.id,
          type: "ADVICE",
          priority: 3,
          message: `Andrea's Strategy: ${prompts[0]}`,
          actionUrl: "/content-studio",
        });
      }
    } catch (err) {
      console.error("Failed to generate advanced advice:", err);
    }
  }

  private async createInsight(params: {
    bandId: string;
    type: InsightType;
    priority: number;
    message: string;
    actionUrl?: string;
    metadata?: any;
  }) {
    // Basic deduplication: don't create the exact same message if it's already there and unread
    const existing = await prisma.managerInsight.findFirst({
      where: {
        bandId: params.bandId,
        message: params.message,
        isRead: false,
      },
    });

    if (existing) return;

    return prisma.managerInsight.create({
      data: params,
    });
  }

  private async checkReviewBacklog(band: any) {
    const reviewCount = await prisma.draft.count({
      where: { bandId: band.id, status: "IN_REVIEW" },
    });

    if (reviewCount >= 3) {
      await this.createInsight({
        bandId: band.id,
        type: "TASK",
        priority: 1,
        message: `You have ${reviewCount} drafts waiting in the review queue. Let's get these polished and scheduled.`,
        actionUrl: "/review-queue",
      });
    }
  }

  private async checkUpcomingShows(band: any) {
    for (const event of band.events) {
      // Find if there's an active campaign for this event
      const campaign = await prisma.campaign.findFirst({
        where: { eventId: event.id, isActive: true },
      });

      const daysUntil = Math.ceil(
        (event.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (!campaign && daysUntil <= 14) {
        await this.createInsight({
          bandId: band.id,
          type: "TASK",
          priority: 2,
          message: `The show at ${event.venue || "the venue"} is only ${daysUntil} days away, but we don't have a promo campaign yet. Should I draft one?`,
          actionUrl: `/campaign-builder?eventId=${event.id}`,
        });
      }
    }
  }

  private async checkPerformanceWins(band: any) {
    const recentPosts = band.publishedPosts;
    if (recentPosts.length === 0) return;

    for (const post of recentPosts) {
      // Simple heuristic: if likes/reach is significantly above average (mock logic for now)
      // In a real app, we'd compare against band averages
      if (post.likes && post.likes > 50) {
        await this.createInsight({
          bandId: band.id,
          type: "CELEBRATION",
          priority: 4,
          message: `Nice! Your post on ${post.platform} from ${post.publishedAt.toLocaleDateString()} is performing 30% better than your average. People are digging it.`,
          actionUrl: "/analytics",
          metadata: { postId: post.id },
        });
      }
    }
  }

  private async checkPostingFrequency(band: any) {
    const lastPost = band.publishedPosts[0];
    if (!lastPost) return;

    const daysSince = Math.ceil(
      (Date.now() - lastPost.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince >= 4) {
      await this.createInsight({
        bandId: band.id,
        type: "ADVICE",
        priority: 3,
        message: `It's been ${daysSince} days since our last post. Let's keep the momentum going - maybe a quick behind-the-scenes update?`,
        actionUrl: "/content-studio",
      });
    }
  }
}
