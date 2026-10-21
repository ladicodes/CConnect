// Applies supabase/migrations/*.sql in order, once each, recording what ran in
// app.schema_migrations. Each file runs inside a single transaction.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const migrationsDir = path.join(root, "supabase", "migrations");

export function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** Strips the file's own top-level BEGIN/COMMIT so the runner can own the transaction. */
function body(sqlText) {
  return sqlText.replace(/^\s*begin;\s*$/im, "").replace(/^\s*commit;\s*$/im, "");
}

/** @param {import('postgres').Sql} sql an owner/superuser connection */
export async function applyMigrations(sql, { log = console.log } = {}) {
  await sql.unsafe(`
    create schema if not exists app;
    create table if not exists app.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const applied = new Set((await sql`select name from app.schema_migrations`).map((row) => row.name));
  const ran = [];
  for (const name of migrationFiles()) {
    if (applied.has(name)) continue;
    const text = readFileSync(path.join(migrationsDir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body(text));
      await tx`insert into app.schema_migrations (name) values (${name})`;
    });
    log(`applied ${name}`);
    ran.push(name);
  }
  if (!ran.length) log("database is up to date");
  return ran;
}
