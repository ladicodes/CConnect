import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff, staffLabel } from "@/lib/auth";
import { getNavCounts } from "@/lib/admin-data";
import { AdminNav } from "@/components/admin/admin-nav";
import { AutoRefresh, ToastProvider } from "@/components/admin/feedback";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Connect-Ask admin" } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
        <main id="main" className="min-w-0 pb-24">
          {children}
        </main>
      </div>
      <AutoRefresh seconds={20} />
    </ToastProvider>
  );
}

async function Sidebar() {
  const staff = await requireStaff();
  const counts = await getNavCounts(staff).catch(() => ({ questions: 0, context: 0, prayers: 0, testimonies: 0 }));
  return <AdminNav role={staff.role} counts={counts} name={staffLabel(staff)} logo={<Logo height={44} eager />} />;
}

function SidebarSkeleton() {
  return (
    <>
      <div className="hidden h-dvh border-r border-line bg-surface lg:block" aria-hidden="true" />
      <div className="h-14 border-b border-line bg-surface lg:hidden" aria-hidden="true" />
    </>
  );
}
