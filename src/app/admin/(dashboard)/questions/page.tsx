import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import {
  QUESTION_TABS,
  getAdminQuestion,
  listAdminQuestions,
  sessionOptions,
  type QuestionQuery,
  type QuestionTab,
} from "@/lib/admin-data";
import { appTimezone } from "@/lib/env";
import { AdminHeader, PageSkeleton, SearchBox, TabLinks, buildHref, param } from "@/components/admin/page-parts";
import { QuestionsWorkspace } from "@/components/admin/questions-workspace";
import { FilterSelect } from "@/components/admin/filter-select";

export const metadata: Metadata = { title: "Questions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_LABELS: Record<QuestionTab, string> = {
  review: "Needs review",
  public: "On the board",
  private: "Private",
  hidden: "Hidden",
  archived: "Archived",
};

export default function QuestionsAdminPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff();
  const params = await searchParams;

  const tabParam = param(params.tab) as QuestionTab;
  const tab: QuestionTab = QUESTION_TABS.includes(tabParam) ? tabParam : "review";
  const answerParam = param(params.answer);
  const answer: QuestionQuery["answer"] = ["open", "addressing", "answered", "unanswered"].includes(answerParam)
    ? (answerParam as QuestionQuery["answer"])
    : "all";
  const sortParam = param(params.sort);
  const sort: QuestionQuery["sort"] = sortParam === "support" || sortParam === "oldest" ? sortParam : "newest";
  const search = param(params.q).trim().slice(0, 100);
  const sessionId = param(params.session) || null;
  const limit = Math.min(Math.max(Number(param(params.limit)) || 50, 50), 500);

  const [{ questions, counts, hasMore }, sessions] = await Promise.all([
    listAdminQuestions(staff, { tab, search, sessionId, answer, sort, limit }),
    sessionOptions(staff),
  ]);

  const requestedId = param(params.id);
  const selectedId = requestedId || questions[0]?.id || null;
  const detail = selectedId ? await getAdminQuestion(staff, selectedId) : null;

  const keep = {
    tab: tab === "review" ? undefined : tab,
    q: search || undefined,
    session: sessionId ?? undefined,
    answer: answer === "all" ? undefined : answer,
    sort: sort === "newest" ? undefined : sort,
  };

  return (
    <>
      <AdminHeader
        title="Questions"
        description="Approve questions for the public board, keep them private, and track which have been answered. Board visibility and answer status are separate."
      />
      <div className="sticky top-14 z-20 border-b border-line bg-paper/95 backdrop-blur-sm lg:top-0">
        <TabLinks
          tabs={QUESTION_TABS}
          current={tab}
          counts={counts}
          labels={TAB_LABELS}
          href={(next) => buildHref("/admin/questions", { ...keep, tab: next === "review" ? undefined : next, answer: undefined })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <SearchBox action="/admin/questions" value={search} keep={{ ...keep, q: undefined }} placeholder="Search questions" />
        <FilterSelect
          label="Service"
          name="session"
          value={sessionId ?? ""}
          options={[
            { value: "", label: "All services" },
            ...sessions.map((s) => ({
              value: s.id,
              label: `${s.status === "active" ? "● " : ""}${s.title} · ${s.service_date}`,
            })),
          ]}
          base="/admin/questions"
          keep={keep}
        />
        <FilterSelect
          label="Answer"
          name="answer"
          value={answer === "all" ? "" : answer}
          options={[
            { value: "", label: "Any answer status" },
            { value: "unanswered", label: "Not yet answered" },
            { value: "open", label: "Open" },
            { value: "addressing", label: "Being addressed" },
            { value: "answered", label: "Answered" },
          ]}
          base="/admin/questions"
          keep={keep}
        />
        <FilterSelect
          label="Sort"
          name="sort"
          value={sort === "newest" ? "" : sort}
          options={[
            { value: "", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "support", label: "Most supported" },
          ]}
          base="/admin/questions"
          keep={keep}
        />
      </div>
      <QuestionsWorkspace
        key={tab}
        tab={tab}
        questions={questions}
        hasMore={hasMore}
        limit={limit}
        detail={detail}
        selectedId={selectedId}
        explicitSelection={Boolean(requestedId)}
        query={keep}
        timeZone={appTimezone()}
        filtered={Boolean(search || sessionId || answer !== "all")}
      />
    </>
  );
}
