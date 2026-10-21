import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { PRAYER_TABS, listPrayers, type PrayerTab } from "@/lib/admin-data";
import { appTimezone } from "@/lib/env";
import { AdminHeader, EmptyState, NotPermitted, PageSkeleton, SearchBox, TabLinks, buildHref, param } from "@/components/admin/page-parts";
import { PrayerList } from "@/components/admin/prayer-list";

export const metadata: Metadata = { title: "Prayer requests" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LABELS: Record<PrayerTab, string> = { new: "New", prayed: "Prayed for", addressed: "Addressed", archived: "Archived" };

export default function PrayersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff();
  if (staff.role !== "admin") return <NotPermitted />;
  const params = await searchParams;
  const tabParam = param(params.tab) as PrayerTab;
  const tab: PrayerTab = PRAYER_TABS.includes(tabParam) ? tabParam : "new";
  const search = param(params.q).trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(param(params.limit)) || 100, 100), 500);
  const { prayers, counts, hasMore } = await listPrayers(staff, { tab, search, limit });
  const keep = { tab: tab === "new" ? undefined : tab, q: search || undefined };

  return (
    <>
      <AdminHeader
        title="Prayer requests"
        tick="var(--color-green)"
        description="Private to administrators. These are never shown publicly or on the presentation screen."
      />
      <div className="sticky top-14 z-20 border-b border-line bg-paper/95 backdrop-blur-sm lg:top-0">
        <TabLinks tabs={PRAYER_TABS} current={tab} counts={counts} labels={LABELS} href={(next) => buildHref("/admin/prayers", { ...keep, tab: next === "new" ? undefined : next })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <SearchBox action="/admin/prayers" value={search} keep={{ ...keep, q: undefined }} placeholder="Search prayer requests" />
      </div>
      {prayers.length === 0 ? (
        <EmptyState
          tick="var(--color-green)"
          title={tab === "new" && !search ? "No new prayer requests" : "Nothing here"}
          body={tab === "new" && !search ? "New requests will appear here. This page refreshes automatically." : "No requests match this view."}
        />
      ) : (
        <PrayerList key={tab} tab={tab} prayers={prayers} timeZone={appTimezone()} />
      )}
      {hasMore && <p className="px-8 py-4 text-sm text-muted">Showing the first {limit}. Narrow the search to see others.</p>}
    </>
  );
}
