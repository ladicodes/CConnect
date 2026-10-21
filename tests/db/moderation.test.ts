import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MODERATOR_ID, appSql, asRole, insertQuestion, ownerSql, resetData, uuid } from "../support/db";

const owner = ownerSql();
const app = appSql(20);
afterAll(async () => {
  await owner.end();
  await app.end();
});
beforeEach(() => resetData(owner));

const mod = <T>(work: Parameters<typeof asRole<T>>[3]) => asRole(app, "connect_ask_staff", MODERATOR_ID, work);

describe("visibility and answer status are independent", () => {
  it("a private question can be answered without being published", async () => {
    const id = await insertQuestion(owner);
    await mod((tx) => tx`update app.questions set visibility = 'private' where id = ${id}`);
    await mod((tx) => tx`update app.questions set answer_status = 'answered' where id = ${id}`);
    const [row] = await owner`select visibility, answer_status, answered_at, published_at from app.questions where id = ${id}`;
    expect(row.visibility).toBe("private");
    expect(row.answer_status).toBe("answered");
    expect(row.answered_at).toBeInstanceOf(Date);
    expect(row.published_at).toBeNull();
  });

  it("marking answered does not change visibility, and publishing does not change answer status", async () => {
    const id = await insertQuestion(owner);
    await mod((tx) => tx`update app.questions set answer_status = 'addressing' where id = ${id}`);
    expect((await owner`select visibility from app.questions where id = ${id}`)[0].visibility).toBe("pending");
    await mod((tx) => tx`update app.questions set visibility = 'public' where id = ${id}`);
    const [row] = await owner`select answer_status, published_at from app.questions where id = ${id}`;
    expect(row.answer_status).toBe("addressing");
    expect(row.published_at).toBeInstanceOf(Date);
  });

  it("reopening clears the answered timestamp", async () => {
    const id = await insertQuestion(owner, { visibility: "public", answer: "answered" });
    await mod((tx) => tx`update app.questions set answer_status = 'open' where id = ${id}`);
    expect((await owner`select answered_at from app.questions where id = ${id}`)[0].answered_at).toBeNull();
  });

  it("logs staff actions without content", async () => {
    const id = await insertQuestion(owner, { body: "Content that must not be logged" });
    await mod((tx) => tx`update app.questions set visibility = 'public' where id = ${id}`);
    const log = await owner`select actor_id, entity, action from app.activity_log`;
    expect(log).toEqual([{ actor_id: MODERATOR_ID, entity: "question", action: "visibility:public" }]);
    expect(JSON.stringify(await owner`select * from app.activity_log`)).not.toContain("must not be logged");
  });
});

describe("presentation", () => {
  it("only public questions can be put on screen", async () => {
    const pending = await insertQuestion(owner);
    await expect(mod((tx) => tx`select app.present_question(${pending}, false)`)).rejects.toMatchObject({ code: "CA409" });
  });

  it("stops showing a question the moment it is hidden", async () => {
    const id = await insertQuestion(owner, { visibility: "public", body: "On the projector" });
    await owner`insert into app.context_notes (client_submission_id, question_id, body, status) values (${uuid()}, ${id}, 'approved note', 'approved')`;
    await mod((tx) => tx`select app.present_question(${id}, true)`);
    const [shown] = await mod((tx) => tx`select mode, body from app.presentation_current()`);
    expect(shown).toMatchObject({ mode: "question", body: "On the projector" });
    expect(await mod((tx) => tx`select body from app.presentation_context(${id})`)).toHaveLength(1);

    await owner`update app.questions set visibility = 'hidden' where id = ${id}`;
    const [after] = await mod((tx) => tx`select mode, body from app.presentation_current()`);
    expect(after).toMatchObject({ mode: "qr", body: null });
    expect(await mod((tx) => tx`select body from app.presentation_context(${id})`)).toHaveLength(0);
  });

  it("does not show context unless asked to", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    await owner`insert into app.context_notes (client_submission_id, question_id, body, status) values (${uuid()}, ${id}, 'note', 'approved')`;
    await mod((tx) => tx`select app.present_question(${id}, false)`);
    expect(await mod((tx) => tx`select body from app.presentation_context(${id})`)).toHaveLength(0);
  });
});

describe("service sessions", () => {
  async function createSession(title: string) {
    const [row] = await mod((tx) => tx<{ id: string }[]>`
      insert into app.service_sessions (title, kind, service_date) values (${title}, 'sunday', current_date) returning id`);
    return row.id;
  }

  it("activating one closes the other", async () => {
    const a = await createSession("Service A");
    const b = await createSession("Service B");
    await mod((tx) => tx`select app.activate_session(${a})`);
    await mod((tx) => tx`select app.activate_session(${b})`);
    const rows = await owner<{ title: string; status: string }[]>`select title, status from app.service_sessions order by title`;
    expect(rows).toEqual([
      { title: "Service A", status: "closed" },
      { title: "Service B", status: "active" },
    ]);
  });

  it("concurrent activations by different leaders still leave exactly one live service", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => createSession(`Service ${i}`)));
    const results = await Promise.allSettled(ids.map((id) => mod((tx) => tx`select app.activate_session(${id})`)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const [{ n }] = await owner`select count(*)::int as n from app.service_sessions where status = 'active'`;
    expect(n).toBe(1);
  });

  it("the database refuses a second active session even without the function", async () => {
    await owner`insert into app.service_sessions (title, service_date, status, activated_at) values ('One', current_date, 'active', now())`;
    await expect(
      owner`insert into app.service_sessions (title, service_date, status, activated_at) values ('Two', current_date, 'active', now())`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("staff cannot set a session's status directly", async () => {
    const id = await createSession("Direct");
    await expect(mod((tx) => tx`update app.service_sessions set status = 'active' where id = ${id}`)).rejects.toMatchObject({ code: "42501" });
  });

  it("archived sessions cannot be activated", async () => {
    const id = await createSession("Old");
    await mod((tx) => tx`select app.archive_session(${id}, true)`);
    await expect(mod((tx) => tx`select app.activate_session(${id})`)).rejects.toMatchObject({ code: "CA404" });
  });
});
