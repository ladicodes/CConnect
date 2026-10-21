// Local-only staff accounts and optional sample content for trying the app.
import { createHash } from "node:crypto";

export const LOCAL_USERS = [
  {
    id: "00000000-0000-4000-8000-00000000a001",
    email: "admin@connect-ask.local",
    password: "local-admin-password",
    role: "admin",
    displayName: "Local admin",
  },
  {
    id: "00000000-0000-4000-8000-00000000a002",
    email: "moderator@connect-ask.local",
    password: "local-moderator-password",
    role: "moderator",
    displayName: "Local moderator",
  },
];

const fakeSupporter = (seed) => createHash("sha256").update(`sample-supporter-${seed}`).digest("hex");

/** @param {import('postgres').Sql} sql owner connection */
export async function seedLocalStaff(sql) {
  for (const user of LOCAL_USERS) {
    await sql`
      insert into app.staff_members (user_id, email, display_name, role)
      values (${user.id}, ${user.email}, ${user.displayName}, ${user.role})
      on conflict (user_id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role
    `;
  }
}

/** Adds sample content once, so every screen has something to show. */
export async function seedSampleContent(sql) {
  const [{ count }] = await sql`select count(*)::int as count from app.service_sessions`;
  if (count > 0) return false;

  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const [current] = await sql`
    insert into app.service_sessions (title, kind, service_date, status, activated_at)
    values ('Sample live service', 'other', ${today}, 'active', now()) returning id`;
  const [previous] = await sql`
    insert into app.service_sessions (title, kind, service_date, status, activated_at, closed_at)
    values ('Sample earlier service', 'other', ${lastWeek}, 'closed', now() - interval '7 days', now() - interval '7 days') returning id`;

  const question = async (sessionId, body, visibility, answer = "open", supporters = 0, minutesAgo = 10) => {
    const [row] = await sql`
      insert into app.questions (client_submission_id, session_id, body, visibility, answer_status, answered_at, published_at, created_at)
      values (gen_random_uuid(), ${sessionId}, ${body}, ${visibility}, ${answer},
              ${answer === "answered" ? sql`now()` : null},
              ${visibility === "public" ? sql`now() - make_interval(mins => ${minutesAgo})` : null},
              now() - make_interval(mins => ${minutesAgo + 2}))
      returning id`;
    for (let i = 0; i < supporters; i++) {
      await sql`insert into app.question_supports (question_id, supporter_hash) values (${row.id}, ${fakeSupporter(`${row.id}-${i}`)})`;
    }
    return row.id;
  };

  const q1 = await question(current.id, "If God already knows what I'm going to pray, why should I still pray?", "public", "answered", 14, 40);
  const q2 = await question(current.id, "How do I know whether a decision is God's will or just what I want?", "public", "addressing", 9, 30);
  await question(current.id, "Is it wrong to have doubts while serving in church?", "public", "open", 6, 20);
  await question(current.id, "What does it practically mean to \"renew your mind\" on a normal weekday?", "public", "open", 3, 12);
  await question(current.id, "How do I forgive someone who hasn't said sorry, when I still see them every week?", "pending", "open", 0, 2);
  await question(current.id, "Can you explain the part of the message about covenant faithfulness again?", "pending", "open", 0, 4);
  await question(current.id, "This question was kept private by a leader.", "private", "answered", 0, 25);
  await question(previous.id, "How can I keep reading the Bible consistently when life gets busy?", "public", "answered", 11, 60 * 24 * 7);
  await question(previous.id, "What is the difference between grace and mercy?", "public", "answered", 7, 60 * 24 * 7 + 5);

  await sql`
    insert into app.context_notes (client_submission_id, question_id, session_id, body, status, reviewed_at)
    values
      (gen_random_uuid(), ${q1}, ${current.id}, 'Matthew 6:8 says the Father knows what we need before we ask. The message pointed out that prayer is relationship, not information.', 'approved', now()),
      (gen_random_uuid(), ${q1}, ${current.id}, 'Philippians 4:6-7 was also mentioned: prayer with thanksgiving brings peace.', 'approved', now()),
      (gen_random_uuid(), ${q2}, ${current.id}, 'Romans 12:2 links testing God''s will with a renewed mind.', 'pending', null),
      (gen_random_uuid(), null, ${current.id}, 'The verse on the slide during the second point was Proverbs 3:5-6.', 'pending', null)
  `;

  await sql`
    insert into app.prayer_requests (client_submission_id, body, status, created_at)
    values
      (gen_random_uuid(), 'Please pray for my exams next week. I have been really anxious.', 'new', now() - interval '20 minutes'),
      (gen_random_uuid(), 'Pray for my family as we look for a new place to live.', 'new', now() - interval '2 hours'),
      (gen_random_uuid(), 'For healing for my grandmother.', 'prayed', now() - interval '3 days')
  `;

  await sql`
    insert into app.testimonies (client_submission_id, kind, body, display_name, share_consent, status, published_at, created_at)
    values
      (gen_random_uuid(), 'testimony', 'After eight months of applications I finally got a job offer this week. I had nearly stopped believing it would happen.', 'Tolu', true, 'published', now() - interval '2 days', now() - interval '2 days'),
      (gen_random_uuid(), 'thanksgiving', 'Thankful for my mum''s successful surgery and for everyone who prayed with our family.', null, true, 'published', now() - interval '5 days', now() - interval '5 days'),
      (gen_random_uuid(), 'thanksgiving', 'Grateful for a peaceful week and new friends in my small group.', null, true, 'pending', null, now() - interval '1 hour'),
      (gen_random_uuid(), 'testimony', 'Something personal I only wanted the pastors to know about.', null, false, 'pending', null, now() - interval '3 hours')
  `;
  return true;
}
