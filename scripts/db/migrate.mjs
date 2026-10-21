#!/usr/bin/env node
// Usage: node --env-file=.env.local scripts/db/migrate.mjs
// Uses DATABASE_ADMIN_URL (the database owner), never the app's DATABASE_URL.
import postgres from "postgres";
import { applyMigrations } from "./migrations.mjs";

const url = process.env.DATABASE_ADMIN_URL?.trim();
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set. Use the `postgres` connection string of your DEVELOPMENT Supabase project.");
  process.exit(1);
}

const host = new URL(url).hostname;
const sql = postgres(url, {
  prepare: false,
  max: 1,
  onnotice: () => {},
  ssl: host === "localhost" || host === "127.0.0.1" ? false : "require",
});

try {
  console.log(`Migrating ${host} ...`);
  await applyMigrations(sql);
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
