import type { Metadata } from "next";
import Link from "next/link";
import { requestTime } from "@/lib/request-time";
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import {
  ANON_COOKIE,
  getActiveSession,
  listPublicQuestions,
  supportedQuestionIds,
  type BoardFilter,
  type BoardScope,
  type BoardSort,
} from "@/lib/public-data";
import { DataUnavailable, loadOrNull } from "@/components/data-unavailable";
import { QuestionRow } from "@/components/questions/question-row";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { LiveDot } from "@/components/status";

export const metadata: Metadata = { title: "Questions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE = 30;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default function QuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="shell-narrow pt-8 md:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">
            <span className="tick" />
            Question Board
          </p>
          <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Questions</h1>
        </div>
        <Link href="/ask" className="btn btn-primary btn-sm mb-1.5 shrink-0">
          Ask a question
        </Link>
      </header>
      <p className="mt-4 max-w-xl text-[1.0625rem] text-ink-2">
        Questions from the congregation, shared after church leaders have reviewed them. If you&rsquo;re wondering the same
        thing, tap <strong className="font-semibold text-magenta-text">Me too</strong>.
      </p>
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Board({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await connection();
  const sessionResult = await loadOrNull("board-session", getActiveSession);
  if ("error" in sessionResult) return <DataUnavailable error={sessionResult.error} what="the questions" />;
  const session = sessionResult.data;

  const requestedScope = one(params.view);
  const scope: BoardScope = session ? (requestedScope === "earlier" ? "earlier" : requestedScope === "all" ? "all" : "current") : "all";
  const filterParam = one(params.filter);
  const filter: BoardFilter = filterParam === "answered" || filterParam === "unanswered" ? filterParam : "all";
  const sort: BoardSort = one(params.sort) === "newest" ? "newest" : "support";
  const search = one(params.q).trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(one(params.limit)) || PAGE, PAGE), 300);

  const cookie = (await cookies()).get(ANON_COOKIE)?.value;
  const result = await loadOrNull("board", async () => {
    const list = await listPublicQuestions({ scope, filter, sort, search, limit }, session?.id ?? null);
    const ids = await supportedQuestionIds(cookie, list.questions.map((q) => q.id));
    return { ...list, supported: ids };
  });
  if ("error" in result) return <DataUnavailable error={result.error} what="the questions" />;
  const { questions, hasMore, supported } = result.data;
  const now = requestTime();

  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const current: Record<string, string> = {
      view: session && scope !== "current" ? scope : "",
      filter: filter === "all" ? "" : filter,
      sort: sort === "support" ? "" : sort,
      q: search,
    };
    for (const [key, value] of Object.entries({ ...current, ...changes })) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/questions?${query}` : "/questions";
  };

  return (
    <>
      <div className="mt-8 space-y-4">
        {session ? (
          <nav aria-label="Which service" className="segmented w-full sm:w-auto">
            <Link
              href={href({ view: null, limit: null })}
              aria-current={scope === "current" ? "page" : undefined}
              className="min-w-0 flex-[2] gap-2"
            >
              <LiveDot />
              <span className="truncate">{session.title}</span>
            </Link>
            <Link href={href({ view: "earlier" })} aria-current={scope === "earlier" ? "page" : undefined} className="flex-1">
              Earlier
            </Link>
          </nav>
        ) : (
          <p className="alert alert-info">
            No service is live right now, so you&rsquo;re seeing questions from all services. You can still ask a question at any
            time.
          </p>
        )}

        <form method="get" action="/questions" role="search" className="relative">
          {session && scope !== "current" && <input type="hidden" name="view" value={scope} />}
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          {sort !== "support" && <input type="hidden" name="sort" value={sort} />}
          <label htmlFor="board-search" className="visually-hidden">
            Search questions
          </label>
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="board-search"
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search questions"
            className="field field-sm h-12 pl-10 pr-12"
            enterKeyHint="search"
            autoComplete="off"
          />
          {search && (
            <Link
              href={href({ q: null })}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
            >
              <CloseIcon size={18} />
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter by answer" className="segmented">
            <Link href={href({ filter: null })} aria-current={filter === "all" ? "page" : undefined}>
              All
            </Link>
            <Link href={href({ filter: "unanswered" })} aria-current={filter === "unanswered" ? "page" : undefined}>
              Unanswered
            </Link>
            <Link href={href({ filter: "answered" })} aria-current={filter === "answered" ? "page" : undefined}>
              Answered
            </Link>
          </nav>
          <nav aria-label="Sort" className="segmented">
            <Link href={href({ sort: null })} aria-current={sort === "support" ? "page" : undefined}>
              Most shared
            </Link>
            <Link href={href({ sort: "newest" })} aria-current={sort === "newest" ? "page" : undefined}>
              Newest
            </Link>
          </nav>
        </div>
      </div>

      <h2 className="visually-hidden">Results</h2>
      {questions.length === 0 ? (
        <EmptyBoard search={search} filter={filter} live={Boolean(session) && scope === "current"} />
      ) : (
        <ol className="hairline mt-4 border-b border-line">
          {questions.map((question) => (
            <QuestionRow
              key={question.id}
              question={question}
              supported={supported.has(question.id)}
              now={now}
              showSession={scope !== "current"}
            />
          ))}
        </ol>
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Link href={href({ limit: String(limit + PAGE) })} scroll={false} className="btn btn-secondary btn-sm">
            Show more questions
          </Link>
        </div>
      )}
    </>
  );
}

function EmptyBoard({ search, filter, live }: { search: string; filter: BoardFilter; live: boolean }) {
  let title = "No questions here yet";
  let body = "Questions appear here once church leaders have reviewed them.";
  if (search) {
    title = "No matching questions";
    body = `Nothing on the board matches “${search}”. Try different words, or ask it yourself.`;
  } else if (filter === "answered") {
    title = "No answered questions yet";
    body = "Questions marked as answered by church leaders will appear here.";
  } else if (filter === "unanswered") {
    title = "Everything here has been answered";
    body = "Every question in this view has been answered.";
  } else if (live) {
    title = "No questions shared yet today";
    body = "Be the first to ask. Leaders review questions before they appear here.";
  }
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex w-fit gap-1.5" aria-hidden="true">
        <span className="tick" />
        <span className="tick" style={{ ["--tick" as string]: "var(--color-magenta)" }} />
      </div>
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-ink-2">{body}</p>
      <Link href="/ask" className="btn btn-primary btn-sm mt-6">
        Ask a question
      </Link>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="mt-8 space-y-6" aria-hidden="true">
      <div className="skeleton h-10 w-full sm:w-80" />
      <div className="skeleton h-12 w-full" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 border-t border-line pt-5">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-2/3" />
          </div>
          <div className="skeleton h-[52px] w-[60px]" />
        </div>
      ))}
    </div>
  );
}
