import "server-only";
import { asStaff, isUuid, type Tx } from "@/lib/db";
import type { Staff } from "@/lib/auth";

/**
 * Staff read model. Every query runs as connect_ask_staff, so row level
 * security applies: a moderator querying prayer requests gets no rows even if
 * a page forgot to check the role.
 */

export type Visibility = "pending" | "public" | "private" | "hidden";
export type AnswerStatus = "open" | "addressing" | "answered";
export type ContextStatus = "pending" | "approved" | "rejected" | "hidden";
export type PrayerStatus = "new" | "prayed" | "addressed";
export type TestimonyStatus = "pending" | "published" | "private" | "rejected";
export type SessionStatus = "draft" | "active" | "closed" | "archived";

function like(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
const iso = (value: Date | null) => (value ? value.toISOString() : null);

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export type Overview = {
  questions: { review: number; public: number; unanswered: number; private: number };
  context: { review: number };
  prayers: { open: number; new: number } | null;
  testimonies: { review: number; consentToShare: number } | null;
  activeSession: { id: string; title: string; serviceDate: string; questions: number; pending: number } | null;
  activity: { entity: string; entityId: string | null; action: string; actor: string | null; createdAt: string }[];
};

export async function getOverview(staff: Staff): Promise<Overview> {
  return asStaff(staff.userId, async (tx) => {
    const [q] = await tx<{ review: number; public: number; unanswered: number; private: number }[]>`
      select
        count(*) filter (where visibility = 'pending' and archived_at is null)::int as review,
        count(*) filter (where visibility = 'public' and archived_at is null)::int as public,
        count(*) filter (where visibility = 'public' and archived_at is null and answer_status <> 'answered')::int as unanswered,
        count(*) filter (where visibility = 'private' and archived_at is null)::int as private
      from app.questions`;
    const [c] = await tx<{ review: number }[]>`
      select count(*) filter (where status = 'pending')::int as review from app.context_notes`;

    let prayers: Overview["prayers"] = null;
    let testimonies: Overview["testimonies"] = null;
    if (staff.role === "admin") {
      const [p] = await tx<{ open: number; new: number }[]>`
        select count(*) filter (where archived_at is null and status <> 'addressed')::int as open,
               count(*) filter (where archived_at is null and status = 'new')::int as new
        from app.prayer_requests`;
      const [t] = await tx<{ review: number; consent: number }[]>`
        select count(*) filter (where status = 'pending' and archived_at is null)::int as review,
               count(*) filter (where status = 'pending' and archived_at is null and share_consent)::int as consent
        from app.testimonies`;
      prayers = p ?? { open: 0, new: 0 };
      testimonies = { review: t?.review ?? 0, consentToShare: t?.consent ?? 0 };
    }

    const [session] = await tx<{ id: string; title: string; service_date: string; questions: number; pending: number }[]>`
      select s.id, s.title, s.service_date::text as service_date,
        (select count(*) from app.questions q where q.session_id = s.id)::int as questions,
        (select count(*) from app.questions q where q.session_id = s.id and q.visibility = 'pending' and q.archived_at is null)::int as pending
      from app.service_sessions s where s.status = 'active' limit 1`;

    const activity = await tx<{ entity: string; entity_id: string | null; action: string; actor: string | null; created_at: Date }[]>`
      select entity, entity_id, action, actor, created_at from app.recent_activity(12)`;

    return {
      questions: q ?? { review: 0, public: 0, unanswered: 0, private: 0 },
      context: c ?? { review: 0 },
      prayers,
      testimonies,
      activeSession: session
        ? { id: session.id, title: session.title, serviceDate: session.service_date, questions: session.questions, pending: session.pending }
        : null,
      activity: activity.map((row) => ({
        entity: row.entity,
        entityId: row.entity_id,
        action: row.action,
        actor: row.actor,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });
}

/** Badge counts for the sidebar. */
export async function getNavCounts(staff: Staff) {
  return asStaff(staff.userId, async (tx) => {
    const [row] = await tx<{ questions: number; context: number; prayers: number; testimonies: number }[]>`
      select
        (select count(*) from app.questions where visibility = 'pending' and archived_at is null)::int as questions,
        (select count(*) from app.context_notes where status = 'pending')::int as context,
        (select count(*) from app.prayer_requests where status = 'new' and archived_at is null)::int as prayers,
        (select count(*) from app.testimonies where status = 'pending' and archived_at is null)::int as testimonies`;
    return row ?? { questions: 0, context: 0, prayers: 0, testimonies: 0 };
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export type SessionRow = {
  id: string;
  title: string;
  kind: string;
  serviceDate: string;
  status: SessionStatus;
  activatedAt: string | null;
  closedAt: string | null;
  questions: number;
  context: number;
};

export async function listSessions(staff: Staff, includeArchived = false): Promise<SessionRow[]> {
  const rows = await asStaff(
    staff.userId,
    (tx) => tx<
      {
        id: string;
        title: string;
        kind: string;
        service_date: string;
        status: SessionStatus;
        activated_at: Date | null;
        closed_at: Date | null;
        questions: number;
        context: number;
      }[]
    >`
      select s.id, s.title, s.kind, s.service_date::text as service_date, s.status, s.activated_at, s.closed_at,
        (select count(*) from app.questions q where q.session_id = s.id)::int as questions,
        (select count(*) from app.context_notes c where c.session_id = s.id)::int as context
      from app.service_sessions s
      ${includeArchived ? tx`` : tx`where s.status <> 'archived'`}
      order by (s.status = 'active') desc, s.service_date desc, s.created_at desc
      limit 200`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    serviceDate: row.service_date,
    status: row.status,
    activatedAt: iso(row.activated_at),
    closedAt: iso(row.closed_at),
    questions: row.questions,
    context: row.context,
  }));
}

export async function sessionOptions(staff: Staff) {
  return asStaff(
    staff.userId,
    (tx) => tx<{ id: string; title: string; service_date: string; status: SessionStatus }[]>`
      select id, title, service_date::text as service_date, status from app.service_sessions
      order by (status = 'active') desc, service_date desc, created_at desc limit 100`,
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
export type QuestionTab = "review" | "public" | "private" | "hidden" | "archived";
export const QUESTION_TABS: QuestionTab[] = ["review", "public", "private", "hidden", "archived"];

export type AdminQuestion = {
  id: string;
  body: string;
  visibility: Visibility;
  answerStatus: AnswerStatus;
  supportCount: number;
  createdAt: string;
  publishedAt: string | null;
  answeredAt: string | null;
  archivedAt: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionDate: string | null;
  contextTotal: number;
  contextPending: number;
};

type QuestionDbRow = {
  id: string;
  body: string;
  visibility: Visibility;
  answer_status: AnswerStatus;
  support_count: number;
  created_at: Date;
  published_at: Date | null;
  answered_at: Date | null;
  archived_at: Date | null;
  session_id: string | null;
  session_title: string | null;
  session_date: string | null;
  context_total: number;
  context_pending: number;
};

const toAdminQuestion = (row: QuestionDbRow): AdminQuestion => ({
  id: row.id,
  body: row.body,
  visibility: row.visibility,
  answerStatus: row.answer_status,
  supportCount: row.support_count,
  createdAt: row.created_at.toISOString(),
  publishedAt: iso(row.published_at),
  answeredAt: iso(row.answered_at),
  archivedAt: iso(row.archived_at),
  sessionId: row.session_id,
  sessionTitle: row.session_title,
  sessionDate: row.session_date,
  contextTotal: row.context_total,
  contextPending: row.context_pending,
});

function questionColumns(tx: Tx) {
  return tx`
    q.id, q.body, q.visibility, q.answer_status, q.support_count, q.created_at, q.published_at, q.answered_at,
    q.archived_at, q.session_id, s.title as session_title, s.service_date::text as session_date,
    (select count(*) from app.context_notes c where c.question_id = q.id)::int as context_total,
    (select count(*) from app.context_notes c where c.question_id = q.id and c.status = 'pending')::int as context_pending`;
}

export type QuestionQuery = {
  tab: QuestionTab;
  search: string;
  sessionId: string | null;
  answer: AnswerStatus | "unanswered" | "all";
  sort: "newest" | "oldest" | "support";
  limit: number;
};

export async function listAdminQuestions(staff: Staff, query: QuestionQuery) {
  return asStaff(staff.userId, async (tx) => {
    const tabClause =
      query.tab === "archived" ? tx`q.archived_at is not null` : tx`q.archived_at is null and q.visibility = ${tabVisibility(query.tab)}`;
    const searchClause = query.search ? tx`and q.body ilike ${like(query.search)}` : tx``;
    const sessionClause = query.sessionId && isUuid(query.sessionId) ? tx`and q.session_id = ${query.sessionId}` : tx``;
    const answerClause =
      query.answer === "all"
        ? tx``
        : query.answer === "unanswered"
          ? tx`and q.answer_status <> 'answered'`
          : tx`and q.answer_status = ${query.answer}`;
    const order =
      query.sort === "support"
        ? tx`q.support_count desc, q.created_at desc`
        : query.sort === "oldest"
          ? tx`q.created_at asc, q.id`
          : tx`q.created_at desc, q.id`;
    const rows = await tx<QuestionDbRow[]>`
      select ${questionColumns(tx)}
      from app.questions q left join app.service_sessions s on s.id = q.session_id
      where ${tabClause} ${searchClause} ${sessionClause} ${answerClause}
      order by ${order}
      limit ${query.limit + 1}`;

    const [counts] = await tx<Record<QuestionTab, number>[]>`
      select
        count(*) filter (where archived_at is null and visibility = 'pending')::int as review,
        count(*) filter (where archived_at is null and visibility = 'public')::int as public,
        count(*) filter (where archived_at is null and visibility = 'private')::int as private,
        count(*) filter (where archived_at is null and visibility = 'hidden')::int as hidden,
        count(*) filter (where archived_at is not null)::int as archived
      from app.questions q
      where true ${sessionClause}`;

    return {
      questions: rows.slice(0, query.limit).map(toAdminQuestion),
      hasMore: rows.length > query.limit,
      counts: counts ?? { review: 0, public: 0, private: 0, hidden: 0, archived: 0 },
    };
  });
}

function tabVisibility(tab: QuestionTab): Visibility {
  return tab === "review" ? "pending" : tab === "archived" ? "pending" : tab;
}

export type AdminContextNote = {
  id: string;
  body: string;
  status: ContextStatus;
  createdAt: string;
  reviewedAt: string | null;
  questionId: string | null;
  questionBody: string | null;
  questionVisibility: Visibility | null;
  sessionTitle: string | null;
  sessionDate: string | null;
};

type ContextDbRow = {
  id: string;
  body: string;
  status: ContextStatus;
  created_at: Date;
  reviewed_at: Date | null;
  question_id: string | null;
  question_body: string | null;
  question_visibility: Visibility | null;
  session_title: string | null;
  session_date: string | null;
};

const toContext = (row: ContextDbRow): AdminContextNote => ({
  id: row.id,
  body: row.body,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  reviewedAt: iso(row.reviewed_at),
  questionId: row.question_id,
  questionBody: row.question_body,
  questionVisibility: row.question_visibility,
  sessionTitle: row.session_title,
  sessionDate: row.session_date,
});

export async function getAdminQuestion(staff: Staff, id: string) {
  if (!isUuid(id)) return null;
  return asStaff(staff.userId, async (tx) => {
    const [row] = await tx<QuestionDbRow[]>`
      select ${questionColumns(tx)}
      from app.questions q left join app.service_sessions s on s.id = q.session_id
      where q.id = ${id}`;
    if (!row) return null;
    const context = await tx<ContextDbRow[]>`
      select c.id, c.body, c.status, c.created_at, c.reviewed_at, c.question_id, null::text as question_body,
             null::text as question_visibility, null::text as session_title, null::text as session_date
      from app.context_notes c where c.question_id = ${id}
      order by c.created_at asc`;
    const [presentation] = await tx<{ question_id: string | null; mode: string }[]>`
      select question_id, mode from app.presentation_state where id = 1`;
    return {
      question: toAdminQuestion(row),
      context: context.map(toContext),
      onScreen: presentation?.mode === "question" && presentation.question_id === id,
    };
  });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
export type ContextTab = "review" | "approved" | "rejected" | "hidden";
export const CONTEXT_TABS: ContextTab[] = ["review", "approved", "rejected", "hidden"];

export async function listAdminContext(
  staff: Staff,
  query: { tab: ContextTab; search: string; link: "all" | "linked" | "independent"; sessionId: string | null; limit: number },
) {
  return asStaff(staff.userId, async (tx) => {
    const status: ContextStatus = query.tab === "review" ? "pending" : query.tab;
    const searchClause = query.search ? tx`and c.body ilike ${like(query.search)}` : tx``;
    const linkClause =
      query.link === "linked" ? tx`and c.question_id is not null` : query.link === "independent" ? tx`and c.question_id is null` : tx``;
    const sessionClause = query.sessionId && isUuid(query.sessionId) ? tx`and c.session_id = ${query.sessionId}` : tx``;
    const rows = await tx<ContextDbRow[]>`
      select c.id, c.body, c.status, c.created_at, c.reviewed_at, c.question_id,
             q.body as question_body, q.visibility as question_visibility,
             s.title as session_title, s.service_date::text as session_date
      from app.context_notes c
      left join app.questions q on q.id = c.question_id
      left join app.service_sessions s on s.id = c.session_id
      where c.status = ${status} ${searchClause} ${linkClause} ${sessionClause}
      order by c.created_at ${query.tab === "review" ? tx`asc` : tx`desc`}
      limit ${query.limit + 1}`;
    const [counts] = await tx<Record<ContextTab, number>[]>`
      select
        count(*) filter (where status = 'pending')::int as review,
        count(*) filter (where status = 'approved')::int as approved,
        count(*) filter (where status = 'rejected')::int as rejected,
        count(*) filter (where status = 'hidden')::int as hidden
      from app.context_notes c where true ${sessionClause}`;
    return {
      notes: rows.slice(0, query.limit).map(toContext),
      hasMore: rows.length > query.limit,
      counts: counts ?? { review: 0, approved: 0, rejected: 0, hidden: 0 },
    };
  });
}

/** Questions a note can be linked to (any non-archived question). */
export async function searchLinkableQuestions(staff: Staff, search: string) {
  return asStaff(
    staff.userId,
    (tx) => tx<{ id: string; body: string; visibility: Visibility; session_title: string | null }[]>`
      select q.id, q.body, q.visibility, s.title as session_title
      from app.questions q left join app.service_sessions s on s.id = q.session_id
      where q.archived_at is null ${search ? tx`and q.body ilike ${like(search)}` : tx``}
      order by (q.visibility = 'public') desc, q.created_at desc
      limit 20`,
  );
}

// ---------------------------------------------------------------------------
// Prayer requests (admins only; RLS returns nothing to anyone else)
// ---------------------------------------------------------------------------
export type PrayerTab = "new" | "prayed" | "addressed" | "archived";
export const PRAYER_TABS: PrayerTab[] = ["new", "prayed", "addressed", "archived"];

export type AdminPrayer = { id: string; body: string; status: PrayerStatus; createdAt: string; archivedAt: string | null };

export async function listPrayers(staff: Staff, query: { tab: PrayerTab; search: string; limit: number }) {
  return asStaff(staff.userId, async (tx) => {
    const tabClause = query.tab === "archived" ? tx`archived_at is not null` : tx`archived_at is null and status = ${query.tab}`;
    const searchClause = query.search ? tx`and body ilike ${like(query.search)}` : tx``;
    const rows = await tx<{ id: string; body: string; status: PrayerStatus; created_at: Date; archived_at: Date | null }[]>`
      select id, body, status, created_at, archived_at from app.prayer_requests
      where ${tabClause} ${searchClause}
      order by created_at ${query.tab === "new" ? tx`asc` : tx`desc`}
      limit ${query.limit + 1}`;
    const [counts] = await tx<Record<PrayerTab, number>[]>`
      select
        count(*) filter (where archived_at is null and status = 'new')::int as new,
        count(*) filter (where archived_at is null and status = 'prayed')::int as prayed,
        count(*) filter (where archived_at is null and status = 'addressed')::int as addressed,
        count(*) filter (where archived_at is not null)::int as archived
      from app.prayer_requests`;
    return {
      prayers: rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        body: row.body,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        archivedAt: iso(row.archived_at),
      })),
      hasMore: rows.length > query.limit,
      counts: counts ?? { new: 0, prayed: 0, addressed: 0, archived: 0 },
    };
  });
}

// ---------------------------------------------------------------------------
// Testimonies (admins only)
// ---------------------------------------------------------------------------
export type TestimonyTab = "review" | "published" | "private" | "rejected" | "archived";
export const TESTIMONY_TABS: TestimonyTab[] = ["review", "published", "private", "rejected", "archived"];

export type AdminTestimony = {
  id: string;
  kind: "thanksgiving" | "testimony";
  body: string;
  displayName: string | null;
  shareConsent: boolean;
  status: TestimonyStatus;
  createdAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export async function listTestimonies(staff: Staff, query: { tab: TestimonyTab; search: string; limit: number }) {
  return asStaff(staff.userId, async (tx) => {
    const status: TestimonyStatus = query.tab === "review" || query.tab === "archived" ? "pending" : query.tab;
    const tabClause = query.tab === "archived" ? tx`archived_at is not null` : tx`archived_at is null and status = ${status}`;
    const searchClause = query.search ? tx`and (body ilike ${like(query.search)} or display_name ilike ${like(query.search)})` : tx``;
    const rows = await tx<
      {
        id: string;
        kind: "thanksgiving" | "testimony";
        body: string;
        display_name: string | null;
        share_consent: boolean;
        status: TestimonyStatus;
        created_at: Date;
        published_at: Date | null;
        archived_at: Date | null;
      }[]
    >`
      select id, kind, body, display_name, share_consent, status, created_at, published_at, archived_at
      from app.testimonies
      where ${tabClause} ${searchClause}
      order by created_at ${query.tab === "review" ? tx`asc` : tx`desc`}
      limit ${query.limit + 1}`;
    const [counts] = await tx<Record<TestimonyTab, number>[]>`
      select
        count(*) filter (where archived_at is null and status = 'pending')::int as review,
        count(*) filter (where archived_at is null and status = 'published')::int as published,
        count(*) filter (where archived_at is null and status = 'private')::int as private,
        count(*) filter (where archived_at is null and status = 'rejected')::int as rejected,
        count(*) filter (where archived_at is not null)::int as archived
      from app.testimonies`;
    return {
      testimonies: rows.slice(0, query.limit).map(
        (row): AdminTestimony => ({
          id: row.id,
          kind: row.kind,
          body: row.body,
          displayName: row.display_name,
          shareConsent: row.share_consent,
          status: row.status,
          createdAt: row.created_at.toISOString(),
          publishedAt: iso(row.published_at),
          archivedAt: iso(row.archived_at),
        }),
      ),
      hasMore: rows.length > query.limit,
      counts: counts ?? { review: 0, published: 0, private: 0, rejected: 0, archived: 0 },
    };
  });
}

// ---------------------------------------------------------------------------
// Live Q&A and presentation
// ---------------------------------------------------------------------------
export type Presentation = {
  mode: "qr" | "question" | "blank";
  questionId: string | null;
  body: string | null;
  answerStatus: AnswerStatus | null;
  supportCount: number;
  showContext: boolean;
  context: { id: string; body: string }[];
  updatedAt: string;
};

export async function getPresentation(staff: Staff): Promise<Presentation> {
  return asStaff(staff.userId, async (tx) => {
    const [row] = await tx<
      {
        mode: "qr" | "question" | "blank";
        question_id: string | null;
        body: string | null;
        answer_status: AnswerStatus | null;
        support_count: number | null;
        show_context: boolean;
        updated_at: Date;
      }[]
    >`select mode, question_id, body, answer_status, support_count, show_context, updated_at from app.presentation_current()`;
    if (!row) {
      return { mode: "qr", questionId: null, body: null, answerStatus: null, supportCount: 0, showContext: false, context: [], updatedAt: new Date(0).toISOString() };
    }
    const context =
      row.mode === "question" && row.question_id && row.show_context
        ? await tx<{ id: string; body: string }[]>`select id, body from app.presentation_context(${row.question_id})`
        : [];
    return {
      mode: row.mode,
      questionId: row.mode === "question" ? row.question_id : null,
      body: row.mode === "question" ? row.body : null,
      answerStatus: row.answer_status,
      supportCount: row.support_count ?? 0,
      showContext: row.show_context,
      context: context.map((c) => ({ id: c.id, body: c.body })),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}

export async function listLiveQuestions(staff: Staff, scope: "session" | "all") {
  return asStaff(staff.userId, async (tx) => {
    const [session] = await tx<{ id: string; title: string; service_date: string }[]>`
      select id, title, service_date::text as service_date from app.service_sessions where status = 'active' limit 1`;
    const sessionClause = scope === "session" && session ? tx`and q.session_id = ${session.id}` : tx``;
    const rows = await tx<QuestionDbRow[]>`
      select ${questionColumns(tx)}
      from app.questions q left join app.service_sessions s on s.id = q.session_id
      where q.visibility = 'public' and q.archived_at is null ${sessionClause}
      order by (q.answer_status = 'answered') asc, q.support_count desc, q.published_at desc
      limit 100`;
    return {
      session: session ? { id: session.id, title: session.title, serviceDate: session.service_date } : null,
      questions: rows.map(toAdminQuestion),
    };
  });
}
