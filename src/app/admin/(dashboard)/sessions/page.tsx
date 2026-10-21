import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { listSessions } from "@/lib/admin-data";
import { appTimezone } from "@/lib/env";
import { AdminHeader, PageSkeleton, param } from "@/components/admin/page-parts";
import { SessionsManager } from "@/components/admin/sessions-manager";

export const metadata: Metadata = { title: "Services" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff();
  const params = await searchParams;
  const showArchived = param(params.archived) === "1";
  const sessions = await listSessions(staff, showArchived);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: appTimezone() }).format(new Date());
  return (
    <>
      <AdminHeader
        title="Services"
        tick="var(--color-red)"
        description="Group questions and context by service. The live service is what the Question Board shows first."
      />
      <SessionsManager sessions={sessions} today={today} showArchived={showArchived} />
    </>
  );
}
