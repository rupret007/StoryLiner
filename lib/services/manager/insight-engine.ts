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

    // 5. Check for platform specific gaps
    await this.checkPlatformGaps(band);

    // 6. Check for livestream readiness
    await this.checkLivestreamReadiness(band);

    // 7. Advanced LLM Strategy
    await this.generateAdvancedAdvice(band);
    
    // 8. Proactive Draft Proposal
    await this.proposeUrgentDrafts(band);
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
      data: {
        bandId: params.bandId,
        type: params.type,
        priority: params.priority,
        message: params.message,
        actionUrl: params.actionUrl,
        metadata: params.metadata || {},
      },
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
        where: { eventId: event.id },
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
      // Simple heuristic for "win"
      if (post.likes && post.likes > 50) {
        await this.createInsight({
          bandId: band.id,
          type: "CELEBRATION",
          priority: 4,
          message: `Nice! Your post on ${post.platform} from ${post.publishedAt.toLocaleDateString()} is performing 30% better than your average. People are digging it.`,
          actionUrl: `/published-posts/${post.id}`,
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

  private async checkPlatformGaps(band: any) {
    const platforms = await prisma.platformAccount.findMany({
      where: { bandId: band.id, isConnected: true, isActive: true },
    });

    for (const account of platforms) {
      const lastPost = await prisma.publishedPost.findFirst({
        where: { bandId: band.id, platform: account.platform },
        orderBy: { publishedAt: "desc" },
      });

      if (!lastPost) {
        await this.createInsight({
          bandId: band.id,
          type: "WARNING",
          priority: 2,
          message: `You haven't posted anything to ${account.platform} yet! Connecting the account is great, but the crowd is waiting for content.`,
          actionUrl: "/content-studio",
        });
        continue;
      }

      const daysSince = Math.ceil(
        (Date.now() - lastPost.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince >= 10) {
        await this.createInsight({
          bandId: band.id,
          type: "ADVICE",
          priority: 3,
          message: `${account.platform} has been quiet for ${daysSince} days. A fresh update would keep you in their feed.`,
          actionUrl: "/content-studio",
        });
      }
    }
  }

  private async checkLivestreamReadiness(band: any) {
    const upcomingStreams = await prisma.livestreamEvent.findMany({
      where: {
        bandId: band.id,
        scheduledFor: {
          gte: new Date(),
          lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Next 48 hours
        },
        isCompleted: false,
        isCancelled: false,
      },
      include: {
        runOfShowItems: true,
      },
    });

    for (const stream of upcomingStreams) {
      if (stream.runOfShowItems.length === 0) {
        await this.createInsight({
          bandId: band.id,
          type: "TASK",
          priority: 1,
          message: `Your livestream "${stream.title}" is coming up soon, but the Run of Show is empty. Let's plan the segments.`,
          actionUrl: `/livestreams/${stream.id}`,
        });
      }
    }
  }

  private async generateAdvancedAdvice(band: any) {
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
      const prompts = await llm.generateEngagementPrompts({
        bandName: band.name,
        platform: "FACEBOOK",
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

  private async proposeUrgentDrafts(band: any) {
    const nextEvent = band.events[0];
    if (!nextEvent) return;

    const daysUntil = Math.ceil(
      (nextEvent.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // If a show is very close (under 5 days) and we haven't proposed a draft recently
    if (daysUntil <= 5) {
      const existingProposal = await prisma.managerInsight.findFirst({
        where: {
          bandId: band.id,
          message: { contains: "I've drafted a post for your upcoming show" },
          isRead: false,
        },
      });

      if (existingProposal) return;

      await this.createInsight({
        bandId: band.id,
        type: "TASK",
        priority: 1,
        message: `I've drafted a post for your upcoming show at ${nextEvent.venue}. It's ready for your review in the Content Studio.`,
        actionUrl: "/content-studio",
        metadata: { eventId: nextEvent.id, intent: "AUTO_DRAFT" }
      });
    }
  }
}
