import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/storyliner/nav/sidebar";
import { Topbar } from "@/components/storyliner/nav/topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [reviewCount, bands] = await Promise.all([
    prisma.draft.count({ where: { status: "IN_REVIEW" } }),
    prisma.band.findMany({ where: { isActive: true }, select: { id: true }, take: 1 }),
  ]);

  let managerInsights: any[] = [];
  if (bands.length > 0) {
    managerInsights = await prisma.managerInsight.findMany({
      where: { bandId: bands[0].id, isRead: false },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 20,
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar reviewCount={reviewCount} managerInsights={managerInsights as any} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}