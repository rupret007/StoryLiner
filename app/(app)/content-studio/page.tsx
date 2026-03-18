import { prisma } from "@/lib/prisma";
import { ContentStudioClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Content Studio" };

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ bandId?: string }>;
}) {
  const { bandId } = await searchParams;

  const bands = await prisma.band.findMany({
    where: { isActive: true },
    include: {
      voiceProfile: true,
      platformAccounts: { where: { isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const selectedBand = bandId
    ? bands.find((b) => b.id === bandId) ?? bands[0]
    : bands[0];

  return <ContentStudioClient bands={bands} selectedBandId={selectedBand?.id} />;
}
