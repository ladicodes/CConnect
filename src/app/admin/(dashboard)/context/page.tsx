import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { CONTEXT_TABS, listAdminContext, sessionOptions, type ContextTab } from "@/lib/admin-data";
import { appTimezone } from "@/lib/env";
import { AdminHeader, EmptyState, PageSkeleton, SearchBox, TabLinks, buildHref, param } from "@/components/admin/page-parts";
import { FilterSelect } from "@/components/admin/filter-select";
import { ContextList } from "@/components/admin/context-list";

export const metadata: Metadata = { title: "Context" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LABELS: Record<ContextTab, string> = { review: "Needs review", approved: "Approved", rejected: "Rejected", hidden: "Hidden" };

export default function ContextAdminPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff();
  const params = await searchParams;
  const tabParam = param(params.tab) as ContextTab;
  const tab: ContextTab = CONTEXT_TABS.includes(tabParam) ? tabParam : "review";
  const linkParam = param(params.link);
  const link = linkParam === "linked" || linkParam === "independent" ? linkParam : "all";
  const search = param(params.q).trim().slice(0, 100);
  const sessionId = param(params.session) || null;
  const limit = Math.min(Math.max(Number(param(params.limit)) || 100, 100), 500);

  const [{ notes, counts, hasMore }, sessions] = await Promise.all([
    listAdminContext(staff, { tab, search, link, sessionId, limit }),
    sessionOptions(staff),
  ]);
  const keep = {
    tab: tab === "review" ? undefined : tab,
    q: search || undefined,
    link: link === "all" ? undefined : link,
    session: sessionId ?? undefined,
  };

  return (
    <>
      <AdminHeader
        title="Context"
        tick="var(--color-cyan)"
        description="Insights and clarifications from members. Approved context appears under its question when that question is on the public board. Independent context is only seen by leaders."
      />
      <div className="sticky top-14 z-20 border-b border-line bg-paper/95 backdrop-blur-sm lg:top-0">
        <TabLinks tabs={CONTEXT_TABS} current={tab} counts={counts} labels={LABELS} href={(next) => buildHref("/admin/context", { ...keep, tab: next === "review" ? undefined : next })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <SearchBox action="/admin/context" value={search} keep={{ ...keep, q: undefined }} placeholder="Search context" />
        <FilterSelect
          label="Linked"
          name="link"
          value={link === "all" ? "" : link}
          options={[
            { value: "", label: "Linked and independent" },
            { value: "linked", label: "Linked to a question" },
            { value: "independent", label: "Independent" },
          ]}
          base="/admin/context"
          keep={keep}
        />
        <FilterSelect
          label="Service"
          name="session"
          value={sessionId ?? ""}
          options={[{ value: "", label: "All services" }, ...sessions.map((s) => ({ value: s.id, label: `${s.title} · ${s.service_date}` }))]}
          base="/admin/context"
          keep={keep}
        />
      </div>
      {notes.length === 0 ? (
        <EmptyState
          tick="var(--color-cyan)"
          title={tab === "review" && !search ? "All caught up" : "Nothing here"}
          body={tab === "review" && !search ? "New context will appear here for review." : "No context matches this view."}
        />
      ) : (
        <ContextList key={tab} tab={tab} notes={notes} timeZone={appTimezone()} />
      )}
      {hasMore && (
        <p className="px-8 py-4 text-sm text-muted">Showing the first {limit}. Narrow the search to see others.</p>
      )}
    </>
  );
}
