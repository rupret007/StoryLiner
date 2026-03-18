import { prisma } from "@/lib/prisma";
import type { JobType } from "@prisma/client";

interface ScheduleJobOptions {
  type: JobType;
  payload: Record<string, unknown>;
  runAt?: Date;
}

export async function scheduleJob(options: ScheduleJobOptions) {
  const { type, payload, runAt = new Date() } = options;

  return prisma.job.create({
    data: {
      type,
      payload: payload as object,
      runAt,
      status: "PENDING",
    },
  });
}

export async function schedulePublishJob(scheduledPostId: string, runAt: Date) {
  return scheduleJob({
    type: "PUBLISH_POST",
    payload: { scheduledPostId },
    runAt,
  });
}

export async function scheduleRecapJob(bandId: string, runAt: Date) {
  return scheduleJob({
    type: "GENERATE_RECAP",
    payload: { bandId },
    runAt,
  });
}
