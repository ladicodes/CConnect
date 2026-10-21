import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ID, MODERATOR_ID, OUTSIDER_ID, appSql, asRole, insertQuestion, ownerSql, resetData, uuid } from "../support/db";

const owner = ownerSql();
const app = appSql();
afterAll(async () => {
  await owner.end();
  await app.end();
});

beforeEach(async () => {
  await resetData(owner);
  await owner`insert into app.prayer_requests (client_submission_id, body) values (${uuid()}, 'Pray for my exams please')`;
  await owner`insert into app.testimonies (client_submission_id, kind, body, share_consent) values (${uuid()}, 'testimony', 'Private testimony text', false)`;
});

const staff = <T>(userId: string, work: Parameters<typeof asRole<T>>[3]) => asRole(app, "connect_ask_staff", userId, work);

describe("prayer requests and testimonies are admin-only", () => {
  it("an admin can read them", async () => {
    expect(await staff(ADMIN_ID, (tx) => tx`select id from app.prayer_requests`)).toHaveLength(1);
    expect(await staff(ADMIN_ID, (tx) => tx`select id from app.testimonies`)).toHaveLength(1);
  });

  it("a moderator sees nothing and cannot change them", async () => {
    expect(await staff(MODERATOR_ID, (tx) => tx`select id from app.prayer_requests`)).toHaveLength(0);
    expect(await staff(MODERATOR_ID, (tx) => tx`select id from app.testimonies`)).toHaveLength(0);
    const updated = await staff(MODERATOR_ID, (tx) => tx`update app.prayer_requests set status = 'prayed' returning id`);
    expect(updated).toHaveLength(0);
    const deleted = await staff(MODERATOR_ID, (tx) => tx`delete from app.testimonies returning id`);
    expect(deleted).toHaveLength(0);
    expect((await owner`select status from app.prayer_requests`)[0].status).toBe("new");
  });

  it("a moderator's activity feed excludes prayer and testimony events", async () => {
    const feed = await staff(MODERATOR_ID, (tx) => tx<{ entity: string }[]>`select entity from app.recent_activity(50)`);
    expect(feed.map((f) => f.entity)).not.toContain("prayer");
    expect(feed.map((f) => f.entity)).not.toContain("testimony");
    const adminFeed = await staff(ADMIN_ID, (tx) => tx<{ entity: string }[]>`select entity from app.recent_activity(50)`);
    expect(adminFeed.map((f) => f.entity)).toEqual(expect.arrayContaining(["prayer", "testimony"]));
  });
});

describe("signed-in users who are not staff", () => {
  it("see no rows anywhere and cannot use staff functions", async () => {
    await insertQuestion(owner, { visibility: "public" });
    expect(await staff(OUTSIDER_ID, (tx) => tx`select id from app.questions`)).toHaveLength(0);
    expect(await staff(OUTSIDER_ID, (tx) => tx`select id from app.prayer_requests`)).toHaveLength(0);
    expect(await staff(OUTSIDER_ID, (tx) => tx`select * from app.whoami()`)).toHaveLength(0);
    await expect(staff(OUTSIDER_ID, (tx) => tx`select * from app.recent_activity(5)`)).rejects.toMatchObject({ code: "42501" });
    await expect(staff(OUTSIDER_ID, (tx) => tx`select app.present_mode('blank')`)).rejects.toMatchObject({ code: "42501" });
  });

  it("a staff transaction with no user id behaves like an outsider", async () => {
    await insertQuestion(owner);
    const rows = await asRole(app, "connect_ask_staff", null, (tx) => tx`select id from app.questions`);
    expect(rows).toHaveLength(0);
  });
});

describe("staff can moderate but never rewrite what members wrote", () => {
  it("cannot edit a question's text", async () => {
    const id = await insertQuestion(owner);
    await expect(staff(ADMIN_ID, (tx) => tx`update app.questions set body = 'Edited by staff' where id = ${id}`)).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("cannot change a testimony's consent", async () => {
    await expect(staff(ADMIN_ID, (tx) => tx`update app.testimonies set share_consent = true`)).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot read or change the staff list directly", async () => {
    await expect(staff(ADMIN_ID, (tx) => tx`select * from app.staff_members`)).rejects.toMatchObject({ code: "42501" });
    await expect(
      staff(MODERATOR_ID, (tx) => tx`update app.staff_members set role = 'admin' where user_id = ${MODERATOR_ID}`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("whoami returns only the caller", async () => {
    const rows = await staff(MODERATOR_ID, (tx) => tx`select email, role from app.whoami()`);
    expect(rows).toEqual([{ email: "moderator@test.local", role: "moderator" }]);
  });
});
