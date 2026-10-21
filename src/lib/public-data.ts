import "server-only";
import { asPublic, isUuid } from "@/lib/db";
import { anonIdSecret } from "@/lib/env";
import { ANON_COOKIE, isValidAnonId, supporterHash } from "@/lib/anon-id";

export type AnswerStatus = "open" | "addressing" | "answered";

export type ActiveSession = { id: string; title: string; kind: string; serviceDate: string };

export type PublicQuestion = {
  id: string;
  body: string;
  answerStatus: AnswerStatus;
  supportCount: number;
  publishedAt: string;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionDate: string | null;
  sessionIsActive: boolean;
  contextCount: number;
};

export type PublicContext = { id: string; body: string; approvedAt: string | null };

export type PublicTestimony = {
  id: string;
  kind: "thanksgiving" | "testimony";
  body: string;
  displayName: string | null;
  publishedAt: string;
};

export type BoardScope = "current" | "earlier" | "all";
export type BoardFilter = "all" | "unanswered" | "answered";
export type BoardSort = "support" | "newest";

type QuestionRow = {
  id: string;
  body: string;
  answer_status: AnswerStatus;
  support_count: number;
  published_at: Date;
  session_id: string | null;
  session_title: string | null;
  session_date: Date | string | null;
  session_is_active: boolean | null;
  context_count: number;
};

function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toQuestion(row: QuestionRow): PublicQuestion {
  return {
    id: row.id,
    body: row.body,
    answerStatus: row.answer_status,
    supportCount: row.support_count,
    publishedAt: row.published_at.toISOString(),
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    sessionDate: isoDate(row.session_date),
    sessionIsActive: Boolean(row.session_is_active),
    contextCount: row.context_count,
  };
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const rows = await asPublic(
    (tx) => tx<{ id: string; title: string; kind: string; service_date: Date | string }[]>`
      select id, title, kind, service_date::text as service_date from app.public_active_session limit 1
    `,
  );
  const row = rows[0];
  return row ? { id: row.id, title: row.title, kind: row.kind, serviceDate: isoDate(row.service_date)! } : null;
}

export type BoardQuery = {
  scope: BoardScope;
  filter: BoardFilter;
  sort: BoardSort;
  search: string;
  limit: number;
};

export async function listPublicQuestions(query: BoardQuery, activeSessionId: string | null) {
  const { scope, filter, sort, search, limit } = query;
  return asPublic(async (tx) => {
    const scopeClause =
      scope === "current" && activeSessionId
        ? tx`and session_id = ${activeSessionId}`
        : scope === "earlier" && activeSessionId
          ? tx`and session_id is distinct from ${activeSessionId}`
          : tx``;
    const filterClause =
      filter === "answered" ? tx`and answer_status = 'answered'` : filter === "unanswered" ? tx`and answer_status <> 'answered'` : tx``;
    const searchClause = search ? tx`and body ilike ${likePattern(search)}` : tx``;
    const order = sort === "newest" ? tx`published_at desc, id` : tx`support_count desc, published_at desc, id`;

    const rows = await tx<QuestionRow[]>`
      select id, body, answer_status, support_count, published_at, session_id, session_title,
             session_date::text as session_date, session_is_active, context_count
      from app.public_questions
      where true ${scopeClause} ${filterClause} ${searchClause}
      order by ${order}
      limit ${limit + 1}
    `;
    return { questions: rows.slice(0, limit).map(toQuestion), hasMore: rows.length > limit };
  });
}

export async function getPublicQuestion(id: string): Promise<PublicQuestion | null> {
  if (!isUuid(id)) return null;
  const rows = await asPublic(
    (tx) => tx<QuestionRow[]>`
      select id, body, answer_status, support_count, published_at, session_id, session_title,
             session_date::text as session_date, session_is_active, context_count
      from app.public_questions where id = ${id}
    `,
  );
  return rows[0] ? toQuestion(rows[0]) : null;
}

export async function listPublicContext(questionId: string): Promise<PublicContext[]> {
  if (!isUuid(questionId)) return [];
  const rows = await asPublic(
    (tx) => tx<{ id: string; body: string; approved_at: Date | null }[]>`
      select id, body, approved_at from app.public_context
      where question_id = ${questionId}
      order by approved_at asc nulls last, id
    `,
  );
  return rows.map((row) => ({ id: row.id, body: row.body, approvedAt: row.approved_at?.toISOString() ?? null }));
}

export async function listPublicTestimonies(limit: number, offset = 0) {
  const rows = await asPublic(
    (tx) => tx<{ id: string; kind: "thanksgiving" | "testimony"; body: string; display_name: string | null; published_at: Date }[]>`
      select id, kind, body, display_name, published_at from app.public_testimonies
      order by published_at desc, id
      limit ${limit + 1} offset ${offset}
    `,
  );
  return {
    testimonies: rows.slice(0, limit).map(
      (row): PublicTestimony => ({
        id: row.id,
        kind: row.kind,
        body: row.body,
        displayName: row.display_name,
        publishedAt: row.published_at.toISOString(),
      }),
    ),
    hasMore: rows.length > limit,
  };
}

/** Which of these questions this browser has already supported. */
export async function supportedQuestionIds(cookieValue: string | undefined, ids: string[]): Promise<Set<string>> {
  const secret = anonIdSecret();
  if (!secret || !isValidAnonId(cookieValue) || ids.length === 0) return new Set();
  const hash = supporterHash(secret, cookieValue);
  const rows = await asPublic(
    (tx) => tx<{ id: string }[]>`select app.supported_question_ids(${hash}, ${tx.array(ids)}::uuid[]) as id`,
  );
  return new Set(rows.map((row) => row.id));
}

export { ANON_COOKIE };
