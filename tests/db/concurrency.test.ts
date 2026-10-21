import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MODERATOR_ID, appSql, asRole, insertQuestion, ownerSql, resetData, supporter, uuid } from "../support/db";

const owner = ownerSql();
const app = appSql(30);
afterAll(async () => {
  await owner.end();
  await app.end();
});
beforeEach(() => resetData(owner));

const pub = <T>(work: Parameters<typeof asRole<T>>[3]) => asRole(app, "connect_ask_public", null, work);

async function supportCount(id: string) {
  const [row] = await owner<{ stored: number; actual: number }[]>`
    select q.support_count as stored, (select count(*)::int from app.question_supports s where s.question_id = q.id) as actual
    from app.questions q where q.id = ${id}`;
  return row;
}

describe("“I have this question too” under load", () => {
  it("100 different people supporting at once are all counted exactly", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    await Promise.all(Array.from({ length: 100 }, (_, i) => pub((tx) => tx`select * from app.set_support(${id}, ${supporter(`p${i}`)}, true)`)));
    expect(await supportCount(id)).toEqual({ stored: 100, actual: 100 });
  });

  it("the same browser tapping 30 times at once still counts once", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    const me = supporter("same-browser");
    await Promise.all(Array.from({ length: 30 }, () => pub((tx) => tx`select * from app.set_support(${id}, ${me}, true)`)));
    expect(await supportCount(id)).toEqual({ stored: 1, actual: 1 });
  });

  it("mixed concurrent supports and removals keep the stored count equal to the real count", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    const people = Array.from({ length: 40 }, (_, i) => supporter(`m${i}`));
    await Promise.all(people.map((p) => pub((tx) => tx`select * from app.set_support(${id}, ${p}, true)`)));
    await Promise.all(
      people.flatMap((p, i) => [
        pub((tx) => tx`select * from app.set_support(${id}, ${p}, ${i % 2 === 0})`),
        pub((tx) => tx`select * from app.set_support(${id}, ${p}, ${i % 2 === 0})`),
      ]),
    );
    expect(await supportCount(id)).toEqual({ stored: 20, actual: 20 });
  });

  it("moderation during voting does not corrupt counts", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    const votes = Array.from({ length: 30 }, (_, i) => pub((tx) => tx`select * from app.set_support(${id}, ${supporter(`v${i}`)}, true)`));
    const moderation = [
      asRole(app, "connect_ask_staff", MODERATOR_ID, (tx) => tx`update app.questions set answer_status = 'addressing' where id = ${id}`),
      asRole(app, "connect_ask_staff", MODERATOR_ID, (tx) => tx`update app.questions set answer_status = 'answered' where id = ${id}`),
    ];
    await Promise.all([...votes, ...moderation]);
    const counts = await supportCount(id);
    expect(counts.stored).toBe(counts.actual);
    expect(counts.actual).toBe(30);
  });
});

describe("simultaneous submissions", () => {
  it("50 different questions at once are all saved", async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => pub((tx) => tx`select app.submit_question(${uuid()}, ${`Concurrent question number ${i}`})`)),
    );
    expect((await owner`select count(*)::int as n from app.questions`)[0].n).toBe(50);
  });

  it("the same submission retried 20 times at once is saved once", async () => {
    const clientId = uuid();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => pub((tx) => tx<{ id: string }[]>`select app.submit_question(${clientId}, 'Retried question') as id`)),
    );
    expect(new Set(results.map((r) => r[0].id)).size).toBe(1);
    expect((await owner`select count(*)::int as n from app.questions`)[0].n).toBe(1);
  });

  it("concurrent context, prayer and testimony submissions are all saved", async () => {
    const q = await insertQuestion(owner, { visibility: "public" });
    await Promise.all([
      ...Array.from({ length: 15 }, (_, i) => pub((tx) => tx`select app.submit_context(${uuid()}, ${q}, ${`Linked note ${i}`})`)),
      ...Array.from({ length: 15 }, (_, i) => pub((tx) => tx`select app.submit_context(${uuid()}, null, ${`Independent note ${i}`})`)),
      ...Array.from({ length: 15 }, (_, i) => pub((tx) => tx`select app.submit_prayer(${uuid()}, ${`Prayer request ${i}`})`)),
      ...Array.from({ length: 15 }, (_, i) =>
        pub((tx) => tx`select app.submit_testimony(${uuid()}, 'thanksgiving', ${`Thanksgiving ${i}`}, null, ${i % 2 === 0})`),
      ),
    ]);
    const [counts] = await owner`
      select (select count(*) from app.context_notes)::int as context,
             (select count(*) from app.context_notes where question_id is not null)::int as linked,
             (select count(*) from app.prayer_requests)::int as prayers,
             (select count(*) from app.testimonies)::int as testimonies`;
    expect(counts).toEqual({ context: 30, linked: 15, prayers: 15, testimonies: 15 });
  });
});

describe("rate limiting", () => {
  it("counts hits per bucket and window atomically", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => pub((tx) => tx<{ ok: boolean }[]>`select app.rate_limit_hit('test:bucket', 10, 600) as ok`)),
    );
    expect(results.filter((r) => r[0].ok)).toHaveLength(10);
  });
});
