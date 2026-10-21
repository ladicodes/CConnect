#!/usr/bin/env node
// Manage who can sign in to Connect-Ask admin. There is no public sign-up.
//
//   node --env-file=.env.local scripts/staff.mjs add <email> <admin|moderator> [display name]
//   node --env-file=.env.local scripts/staff.mjs role <email> <admin|moderator>
//   node --env-file=.env.local scripts/staff.mjs remove <email>
//   node --env-file=.env.local scripts/staff.mjs list
//
// The person must first exist in Supabase Auth (Authentication > Users >
// "Invite user" or "Add user"). Uses DATABASE_ADMIN_URL; never runs on Vercel.
import postgres from "postgres";

const [command, email, roleOrName, ...rest] = process.argv.slice(2);
const url = process.env.DATABASE_ADMIN_URL?.trim();
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set.");
  process.exit(1);
}
const host = new URL(url).hostname;
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ssl: host === "localhost" || host === "127.0.0.1" ? false : "require" });

const ROLES = new Set(["admin", "moderator"]);

async function findUser(address) {
  const [user] = await sql`select id, email from auth.users where lower(email) = lower(${address})`;
  if (!user) throw new Error(`No Supabase Auth user with email ${address}. Invite or add them in Supabase first.`);
  return user;
}

try {
  if (command === "add") {
    if (!email || !ROLES.has(roleOrName)) throw new Error("Usage: staff.mjs add <email> <admin|moderator> [display name]");
    const user = await findUser(email);
    const displayName = rest.join(" ").trim() || null;
    await sql`
      insert into app.staff_members (user_id, email, display_name, role)
      values (${user.id}, ${user.email}, ${displayName}, ${roleOrName})
      on conflict (user_id) do update set role = excluded.role, email = excluded.email,
        display_name = coalesce(excluded.display_name, app.staff_members.display_name)`;
    console.log(`${user.email} is now a ${roleOrName}.`);
  } else if (command === "role") {
    if (!email || !ROLES.has(roleOrName)) throw new Error("Usage: staff.mjs role <email> <admin|moderator>");
    const rows = await sql`update app.staff_members set role = ${roleOrName} where lower(email) = lower(${email}) returning email`;
    if (!rows.length) throw new Error(`${email} is not a staff member.`);
    console.log(`${rows[0].email} is now a ${roleOrName}.`);
  } else if (command === "remove") {
    if (!email) throw new Error("Usage: staff.mjs remove <email>");
    const rows = await sql`delete from app.staff_members where lower(email) = lower(${email}) returning email`;
    console.log(rows.length ? `${rows[0].email} no longer has admin access.` : `${email} was not a staff member.`);
  } else if (command === "list") {
    const rows = await sql`select email, role, display_name, created_at from app.staff_members order by role, email`;
    if (!rows.length) console.log("No staff members yet.");
    for (const row of rows) console.log(`${row.role.padEnd(10)} ${row.email}${row.display_name ? `  (${row.display_name})` : ""}`);
  } else {
    throw new Error("Commands: add, role, remove, list");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
