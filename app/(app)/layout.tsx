import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/storyliner/nav/sidebar";
import { Topbar } from "@/components/storyliner/nav/topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const reviewCount = await prisma.draft.count({ where: { status: "IN_REVIEW" } });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar reviewCount={reviewCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
