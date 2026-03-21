import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/storyliner/nav/sidebar";
import { Topbar } from "@/components/storyliner/nav/topbar";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeBandIdCookie = cookieStore.get("activeBandId")?.value;
  const sidebarCollapsed = cookieStore.get("sidebarCollapsed")?.value === "true";

  const [reviewCount, bands] = await Promise.all([
    prisma.draft.count({ where: { status: "IN_REVIEW" } }),
    prisma.band.findMany({ 
      where: { isActive: true }, 
      select: { id: true, name: true, slug: true, coverColor: true },
      orderBy: { createdAt: "desc" }
    }),
  ]);

  const activeBand = bands.find(b => b.id === activeBandIdCookie) || bands[0];
  const activeBandId = activeBand?.id;

  let managerInsights: any[] = [];
  if (activeBandId) {
    managerInsights = await prisma.managerInsight.findMany({
      where: { bandId: activeBandId, isRead: false },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 20,
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar bands={bands} activeBandId={activeBandId} isCollapsed={sidebarCollapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar reviewCount={reviewCount} managerInsights={managerInsights as any} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
