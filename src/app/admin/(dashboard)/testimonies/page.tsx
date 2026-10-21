import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { TESTIMONY_TABS, listTestimonies, type TestimonyTab } from "@/lib/admin-data";
import { appTimezone } from "@/lib/env";
import { AdminHeader, EmptyState, NotPermitted, PageSkeleton, SearchBox, TabLinks, buildHref, param } from "@/components/admin/page-parts";
import { TestimonyList } from "@/components/admin/testimony-list";

export const metadata: Metadata = { title: "Testimonies" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LABELS: Record<TestimonyTab, string> = {
  review: "Needs review",
  published: "Published",
  private: "Kept private",
  rejected: "Rejected",
  archived: "Archived",
};

export default function TestimoniesAdminPage({ searchParams }: { searchParams: SearchParams }) {
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
  const tabParam = param(params.tab) as TestimonyTab;
  const tab: TestimonyTab = TESTIMONY_TABS.includes(tabParam) ? tabParam : "review";
  const search = param(params.q).trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(param(params.limit)) || 100, 100), 500);
  const { testimonies, counts, hasMore } = await listTestimonies(staff, { tab, search, limit });
  const keep = { tab: tab === "review" ? undefined : tab, q: search || undefined };

  return (
    <>
      <AdminHeader
        title="Thanksgiving & testimonies"
        tick="var(--color-yellow)"
        description="A message can only be published if the person chose to allow public sharing and an administrator approves it."
      />
      <div className="sticky top-14 z-20 border-b border-line bg-paper/95 backdrop-blur-sm lg:top-0">
        <TabLinks tabs={TESTIMONY_TABS} current={tab} counts={counts} labels={LABELS} href={(next) => buildHref("/admin/testimonies", { ...keep, tab: next === "review" ? undefined : next })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <SearchBox action="/admin/testimonies" value={search} keep={{ ...keep, q: undefined }} placeholder="Search messages" />
      </div>
      {testimonies.length === 0 ? (
        <EmptyState
          tick="var(--color-yellow)"
          title={tab === "review" && !search ? "All caught up" : "Nothing here"}
          body={tab === "review" && !search ? "New thanksgiving and testimonies will appear here." : "No messages match this view."}
        />
      ) : (
        <TestimonyList key={tab} tab={tab} testimonies={testimonies} timeZone={appTimezone()} />
      )}
      {hasMore && <p className="px-8 py-4 text-sm text-muted">Showing the first {limit}. Narrow the search to see others.</p>}
    </>
  );
}
