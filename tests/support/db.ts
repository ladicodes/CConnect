import postgres from "postgres";
import { inject } from "vitest";
import { randomUUID, createHash } from "node:crypto";

export const ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
export const MODERATOR_ID = "00000000-0000-4000-8000-0000000000a2";
export const OUTSIDER_ID = "00000000-0000-4000-8000-0000000000a3";

export function ownerSql() {
  return postgres(inject("adminUrl"), { max: 4, onnotice: () => {} });
}

/** Connects as the application's login role (no privileges of its own). */
export function appSql(max = 10) {
  return postgres(inject("appUrl"), { max, onnotice: () => {} });
}

export async function asRole<T>(
  sql: postgres.Sql,
  role: "connect_ask_public" | "connect_ask_staff",
  userId: string | null,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    if (userId) await tx`select set_config('app.user_id', ${userId}, true)`;
    return work(tx);
  })) as T;
}

export const supporter = (seed: string) => createHash("sha256").update(seed).digest("hex");
export const uuid = () => randomUUID();

export async function resetData(owner: postgres.Sql) {
  await owner.unsafe(`
    truncate app.question_supports, app.context_notes, app.questions, app.prayer_requests,
             app.testimonies, app.activity_log, app.rate_limits restart identity cascade;
    delete from app.service_sessions;
    insert into app.presentation_state (id) values (1)
      on conflict (id) do update set mode = 'qr', question_id = null, show_context = false;
    delete from app.staff_members;
  `);
  await owner`
    insert into app.staff_members (user_id, email, role) values
      (${ADMIN_ID}, 'admin@test.local', 'admin'),
      (${MODERATOR_ID}, 'moderator@test.local', 'moderator')`;
}

export async function insertQuestion(
  owner: postgres.Sql,
  fields: { body?: string; visibility?: string; answer?: string; sessionId?: string | null; archived?: boolean } = {},
) {
  const visibility = fields.visibility ?? "pending";
  const answer = fields.answer ?? "open";
  const [row] = await owner<{ id: string }[]>`
    insert into app.questions (client_submission_id, body, visibility, answer_status, answered_at, published_at, session_id, archived_at)
    values (${uuid()}, ${fields.body ?? "A test question for the board"}, ${visibility}, ${answer},
            ${answer === "answered" ? owner`now()` : null}, ${visibility === "public" ? owner`now()` : null},
            ${fields.sessionId ?? null}, ${fields.archived ? owner`now()` : null})
    returning id`;
  return row.id;
}
