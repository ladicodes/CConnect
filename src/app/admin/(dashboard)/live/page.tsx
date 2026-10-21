import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { getPresentation, listLiveQuestions } from "@/lib/admin-data";
import { formatServiceDate } from "@/lib/format";
import { AdminHeader, PageSkeleton, param } from "@/components/admin/page-parts";
import { LiveControl } from "@/components/admin/live-control";
import { AutoRefresh } from "@/components/admin/feedback";

export const metadata: Metadata = { title: "Live Q&A" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LivePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff();
  const params = await searchParams;
  const scope = param(params.scope) === "all" ? "all" : "session";
  const [presentation, live] = await Promise.all([getPresentation(staff), listLiveQuestions(staff, scope)]);

  return (
    <>
      <AutoRefresh seconds={6} />
      <AdminHeader
        title="Live Q&A"
        tick="var(--color-magenta)"
        description={
          live.session
            ? `${live.session.title} · ${formatServiceDate(live.session.serviceDate)} is live. Choose what the screen shows.`
            : "No service is live, so all questions on the board are listed."
        }
        actions={
          live.session ? (
            <nav className="segmented" aria-label="Which questions">
              <Link href="/admin/live" aria-current={scope === "session" ? "page" : undefined}>
                This service
              </Link>
              <Link href="/admin/live?scope=all" aria-current={scope === "all" ? "page" : undefined}>
                All
              </Link>
            </nav>
          ) : null
        }
      />
      <LiveControl presentation={presentation} questions={live.questions} scope={scope} hasSession={Boolean(live.session)} />
    </>
  );
}
