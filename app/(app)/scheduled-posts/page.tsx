import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BandChip } from "@/components/storyliner/band-chip";
import { PlatformIcon } from "@/components/storyliner/platform-icon";
import { EmptyState } from "@/components/storyliner/empty-state";
import { Clock } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { jobMayHaveStartedAdapterWrite } from "@/lib/jobs/publish-attempt";
import {
  honestJobFailureMessage,
  isQueuedUpcomingSchedule,
  scheduleQueueHeadline,
  writeStartedQueueWarning,
} from "@/lib/services/publish/safety";
import { RescheduleButton, ReturnScheduleButton } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scheduled Posts" };
export const dynamic = "force-dynamic";

export default async function ScheduledPostsPage() {
  const posts = await prisma.scheduledPost.findMany({
    where: { status: "SCHEDULED" },
    include: {
      band: true,
      draft: true,
      platformAccount: true,
      job: true,
    },
    orderBy: { scheduledFor: "asc" },
  });

  const past = await prisma.scheduledPost.findMany({
    where: { status: { in: ["PUBLISHED"] } },
    include: { band: true, draft: true },
    orderBy: { scheduledFor: "desc" },
    take: 10,
  });

  let queued = 0;
  let failedWriteStarted = 0;
  for (const post of posts) {
    const writeStarted = post.job
      ? jobMayHaveStartedAdapterWrite(post.job.payload)
      : false;
    if (
      isQueuedUpcomingSchedule({
        jobStatus: post.job?.status ?? null,
        adapterWriteStarted: writeStarted,
      })
    ) {
      queued += 1;
    } else if (writeStarted) {
      failedWriteStarted += 1;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {scheduleQueueHeadline({ queued, failedWriteStarted })}
        </p>
        <p className="text-xs text-muted-foreground">
          Worker jobs only. Unschedule a pending job, or return a failed write —
          neither publishes. A write that already started needs a platform check first.
        </p>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing scheduled"
          description="Approve a Bob draft in the review queue, then schedule it here. Scheduling is not publish."
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const jobStatus = post.job?.status ?? null;
            const jobFailed = jobStatus === "FAILED";
            const jobRunning = jobStatus === "RUNNING";
            const writeStarted = post.job
              ? jobMayHaveStartedAdapterWrite(post.job.payload)
              : false;
            const writeMayBeLive = writeStarted && !jobRunning;
            const failureNote = honestJobFailureMessage({
              errorMessage: post.job?.errorMessage,
              adapterWriteStarted: writeStarted,
            });
            return (
              <Card key={post.id}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 shrink-0 w-16 text-center">
                    <div className="text-xs text-muted-foreground">
                      {new Date(post.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className="text-lg font-bold text-foreground">
                      {new Date(post.scheduledFor).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="h-12 w-px bg-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <PlatformIcon platform={post.draft.platform} showLabel />
                      <BandChip name={post.band.name} color={post.band.coverColor} />
                      {jobRunning ? (
                        <Badge variant="warning" className="text-xs">Publishing</Badge>
                      ) : jobFailed || writeMayBeLive ? (
                        <Badge variant="destructive" className="text-xs">Publish failed</Badge>
                      ) : (
                        <Badge variant="info" className="text-xs">Scheduled</Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{post.draft.caption}</p>
                    {post.draft.hashtags.length > 0 && (
                      <p className="text-xs text-primary mt-1 line-clamp-1">
                        {post.draft.hashtags.join(" ")}
                      </p>
                    )}
                    {(jobFailed || writeMayBeLive) && failureNote && (
                      <p className="text-xs text-rose-300 mt-2">
                        {failureNote}
                      </p>
                    )}
                    {writeMayBeLive && (
                      <p className="text-xs text-amber-200 mt-2">
                        {writeStartedQueueWarning({ jobFailed })}
                      </p>
                    )}
                    {jobRunning && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Worker is writing now. Cannot unschedule or reschedule.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-2">
                    {jobRunning ? null : jobFailed || writeMayBeLive ? (
                      <ReturnScheduleButton
                        scheduledPostId={post.id}
                        jobStatus={jobStatus}
                        adapterWriteStarted={writeStarted}
                      />
                    ) : (
                      <>
                        <RescheduleButton
                          scheduledPostId={post.id}
                          currentScheduledFor={post.scheduledFor}
                        />
                        <ReturnScheduleButton
                          scheduledPostId={post.id}
                          jobStatus={jobStatus ?? "PENDING"}
                          adapterWriteStarted={writeStarted}
                        />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Recently published</h2>
          <div className="space-y-2">
            {past.map((post) => (
              <div key={post.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                <PlatformIcon platform={post.draft.platform} />
                <p className="flex-1 text-muted-foreground line-clamp-1">{post.draft.caption}</p>
                <BandChip name={post.band.name} color={post.band.coverColor} />
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelative(post.scheduledFor)}
                </span>
                <Badge variant="success" className="text-xs shrink-0">Published</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
