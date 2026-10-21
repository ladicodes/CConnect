import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appSql, asRole, insertQuestion, ownerSql, resetData, uuid } from "../support/db";

const owner = ownerSql();
const app = appSql();
afterAll(async () => {
  await owner.end();
  await app.end();
});
beforeEach(() => resetData(owner));

const asPublic = <T>(work: Parameters<typeof asRole<T>>[3]) => asRole(app, "connect_ask_public", null, work);

describe("public role: tables are unreachable", () => {
  for (const table of [
    "questions",
    "question_supports",
    "context_notes",
    "prayer_requests",
    "testimonies",
    "service_sessions",
    "staff_members",
    "presentation_state",
    "activity_log",
    "rate_limits",
  ]) {
    it(`cannot select from app.${table}`, async () => {
      await expect(asPublic((tx) => tx.unsafe(`select * from app.${table} limit 1`))).rejects.toMatchObject({ code: "42501" });
    });
  }

  it("cannot insert a question directly, so it can never choose its own moderation status", async () => {
    await expect(
      asPublic((tx) => tx`insert into app.questions (client_submission_id, body, visibility) values (${uuid()}, 'sneaky public question', 'public')`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot update or delete moderation state", async () => {
    const id = await insertQuestion(owner);
    await expect(asPublic((tx) => tx`update app.questions set visibility = 'public' where id = ${id}`)).rejects.toMatchObject({ code: "42501" });
    await expect(asPublic((tx) => tx`delete from app.questions where id = ${id}`)).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot call staff functions", async () => {
    const [session] = await owner`insert into app.service_sessions (title, service_date) values ('Test', current_date) returning id`;
    await expect(asPublic((tx) => tx`select app.activate_session(${session.id})`)).rejects.toMatchObject({ code: "42501" });
    await expect(asPublic((tx) => tx`select * from app.presentation_current()`)).rejects.toMatchObject({ code: "42501" });
    await expect(asPublic((tx) => tx`select * from app.recent_activity(5)`)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("public read model", () => {
  it("shows only public, unarchived questions", async () => {
    const visible = await insertQuestion(owner, { body: "Visible public question", visibility: "public" });
    await insertQuestion(owner, { body: "Pending question", visibility: "pending" });
    await insertQuestion(owner, { body: "Private question", visibility: "private", answer: "answered" });
    await insertQuestion(owner, { body: "Hidden question", visibility: "hidden" });
    await insertQuestion(owner, { body: "Archived public question", visibility: "public", archived: true });

    const rows = await asPublic((tx) => tx<{ id: string; body: string }[]>`select id, body from app.public_questions`);
    expect(rows.map((r) => r.id)).toEqual([visible]);
  });

  it("exposes only safe columns on public questions", async () => {
    await insertQuestion(owner, { visibility: "public" });
    const [row] = await asPublic((tx) => tx`select * from app.public_questions`);
    expect(Object.keys(row).sort()).toEqual(
      [
        "answer_status",
        "answered_at",
        "body",
        "context_count",
        "id",
        "published_at",
        "session_date",
        "session_id",
        "session_is_active",
        "session_title",
        "support_count",
      ].sort(),
    );
  });

  it("shows linked context only when the context is approved AND its question is public", async () => {
    const publicQ = await insertQuestion(owner, { visibility: "public" });
    const privateQ = await insertQuestion(owner, { visibility: "private" });
    await owner`
      insert into app.context_notes (client_submission_id, question_id, body, status) values
        (${uuid()}, ${publicQ}, 'approved on public', 'approved'),
        (${uuid()}, ${publicQ}, 'pending on public', 'pending'),
        (${uuid()}, ${publicQ}, 'hidden on public', 'hidden'),
        (${uuid()}, ${privateQ}, 'approved on private', 'approved'),
        (${uuid()}, null, 'approved independent', 'approved')`;
    const rows = await asPublic((tx) => tx<{ body: string }[]>`select body from app.public_context`);
    expect(rows.map((r) => r.body)).toEqual(["approved on public"]);

    // Hiding the question removes its context from every public path at once.
    await owner`update app.questions set visibility = 'hidden' where id = ${publicQ}`;
    expect(await asPublic((tx) => tx`select body from app.public_context`)).toHaveLength(0);
    expect(await asPublic((tx) => tx`select id from app.public_questions`)).toHaveLength(0);
  });

  it("counts only approved context on public questions", async () => {
    const q = await insertQuestion(owner, { visibility: "public" });
    await owner`
      insert into app.context_notes (client_submission_id, question_id, body, status) values
        (${uuid()}, ${q}, 'approved one', 'approved'), (${uuid()}, ${q}, 'pending one', 'pending')`;
    const [row] = await asPublic((tx) => tx<{ context_count: number }[]>`select context_count from app.public_questions`);
    expect(row.context_count).toBe(1);
  });

  it("never exposes prayer requests through any public view", async () => {
    await asPublic((tx) => tx`select app.submit_prayer(${uuid()}, 'please pray for my family')`);
    const views = await owner<{ table_name: string }[]>`
      select table_name from information_schema.role_table_grants
      where grantee = 'connect_ask_public' and privilege_type = 'SELECT'`;
    expect(views.map((v) => v.table_name).sort()).toEqual(
      ["public_active_session", "public_context", "public_questions", "public_testimonies"].sort(),
    );
    for (const { table_name } of views) {
      const rows = await asPublic((tx) => tx.unsafe(`select * from app.${table_name}`));
      expect(JSON.stringify(rows)).not.toContain("pray for my family");
    }
  });
});

describe("testimonies: consent AND approval", () => {
  it("submitter consent alone does not publish", async () => {
    await asPublic((tx) => tx`select app.submit_testimony(${uuid()}, 'testimony', 'God provided a job for me', 'Ada', true)`);
    expect(await asPublic((tx) => tx`select id from app.public_testimonies`)).toHaveLength(0);
  });

  it("admin approval cannot override missing consent (database constraint)", async () => {
    await asPublic((tx) => tx`select app.submit_testimony(${uuid()}, 'thanksgiving', 'A private thanksgiving note', null, false)`);
    await expect(owner`update app.testimonies set status = 'published'`).rejects.toMatchObject({ code: "23514" });
    expect(await asPublic((tx) => tx`select id from app.public_testimonies`)).toHaveLength(0);
  });

  it("consent plus approval publishes, with only safe fields", async () => {
    await asPublic((tx) => tx`select app.submit_testimony(${uuid()}, 'testimony', 'Healing after surgery', 'Tolu', true)`);
    await owner`update app.testimonies set status = 'published'`;
    const rows = await asPublic((tx) => tx`select * from app.public_testimonies`);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["body", "display_name", "id", "kind", "published_at"]);
  });

  it("archived testimonies leave the public page", async () => {
    await asPublic((tx) => tx`select app.submit_testimony(${uuid()}, 'testimony', 'An old testimony here', null, true)`);
    await owner`update app.testimonies set status = 'published'`;
    await owner`update app.testimonies set archived_at = now()`;
    expect(await asPublic((tx) => tx`select id from app.public_testimonies`)).toHaveLength(0);
  });
});

describe("public submissions", () => {
  it("are always pending and attached to the live service", async () => {
    const [session] = await owner`insert into app.service_sessions (title, service_date, status, activated_at) values ('Live', current_date, 'active', now()) returning id`;
    await asPublic((tx) => tx`select app.submit_question(${uuid()}, 'Is this pending by default?')`);
    const [row] = await owner`select visibility, answer_status, session_id from app.questions`;
    expect(row).toMatchObject({ visibility: "pending", answer_status: "open", session_id: session.id });
  });

  it("are idempotent per client submission id", async () => {
    const clientId = uuid();
    const first = await asPublic((tx) => tx`select app.submit_question(${clientId}, 'Only once please') as id`);
    const second = await asPublic((tx) => tx`select app.submit_question(${clientId}, 'Only once please') as id`);
    expect(first[0].id).toBe(second[0].id);
    expect((await owner`select count(*)::int as n from app.questions`)[0].n).toBe(1);
  });

  it("cannot attach context to a question that is not public", async () => {
    const privateQ = await insertQuestion(owner, { visibility: "private" });
    await expect(asPublic((tx) => tx`select app.submit_context(${uuid()}, ${privateQ}, 'context for a private one')`)).rejects.toMatchObject({
      code: "CA404",
    });
  });

  it("cannot support a question that is not public", async () => {
    const pending = await insertQuestion(owner, { visibility: "pending" });
    await expect(asPublic((tx) => tx`select * from app.set_support(${pending}, ${"a".repeat(64)}, true)`)).rejects.toMatchObject({
      code: "CA404",
    });
  });

  it("rejects bodies the database considers invalid even if the app missed it", async () => {
    await expect(asPublic((tx) => tx`select app.submit_question(${uuid()}, '  padded  ')`)).rejects.toMatchObject({ code: "23514" });
    await expect(asPublic((tx) => tx`select app.submit_question(${uuid()}, ${"x".repeat(1001)})`)).rejects.toMatchObject({ code: "23514" });
  });
});

describe("function permissions inventory", () => {
  async function executable(role: string) {
    const rows = await owner<{ name: string }[]>`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and has_function_privilege(${role}, p.oid, 'EXECUTE') order by 1`;
    return rows.map((r) => r.name);
  }

  it("the public role can call only the submission, support and rate-limit functions", async () => {
    expect(await executable("connect_ask_public")).toEqual(
      ["rate_limit_hit", "set_support", "submit_context", "submit_prayer", "submit_question", "submit_testimony", "supported_question_ids"].sort(),
    );
  });

  it("the staff role can call only staff functions", async () => {
    expect(await executable("connect_ask_staff")).toEqual(
      [
        "activate_session",
        "active_session_id",
        "archive_session",
        "close_session",
        "current_user_id",
        "present_mode",
        "present_question",
        "presentation_context",
        "presentation_current",
        "recent_activity",
        "staff_role",
        "whoami",
      ].sort(),
    );
  });

  it("the app login role has no direct privileges on any table", async () => {
    const [row] = await owner<{ n: number }[]>`
      select count(*)::int as n from information_schema.role_table_grants where grantee = 'connect_ask_app'`;
    expect(row.n).toBe(0);
  });
});
