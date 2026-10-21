#!/usr/bin/env node
// Runs Connect-Ask locally with no accounts or credentials:
//   - a private Postgres database in .local/postgres (migrated automatically)
//   - a local stand-in for Supabase Auth with two staff logins
//   - `next dev` (or `next start` with --production) wired to both
//
// Usage: npm run dev:local [-- --reset] [-- --sample] [-- --production]
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { portInUse, startLocalDatabase } from "./postgres.mjs";
import { startMockAuth } from "./mock-auth.mjs";
import { LOCAL_USERS, seedLocalStaff, seedSampleContent } from "./seed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const dataDir = process.env.LOCAL_DATA_DIR ? path.resolve(root, process.env.LOCAL_DATA_DIR) : path.join(root, ".local", "postgres");
const DB_PORT = Number(process.env.LOCAL_DB_PORT) || 54432;
const AUTH_PORT = Number(process.env.LOCAL_AUTH_PORT) || 54431;
const APP_PORT = Number(process.env.PORT) || 3000;

function fail(message) {
  console.error(`\n  Could not start Connect-Ask locally.\n  ${message}\n`);
  process.exit(1);
}

for (const [port, what] of [
  [APP_PORT, "the website"],
  [AUTH_PORT, "local sign-in"],
]) {
  if (await portInUse(port)) {
    fail(
      `Port ${port} (${what}) is already in use. Another Connect-Ask dev server is probably still running. ` +
        `Stop it with Ctrl+C in its terminal, or find it with: lsof -i :${port}`,
    );
  }
}

if (args.has("--reset")) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log("Local database reset.");
}

let db;
try {
  db = await startLocalDatabase({ dataDir, port: DB_PORT, log: (m) => console.log(`[db] ${m}`) });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const owner = postgres(db.adminUrl, { max: 1, onnotice: () => {} });
await seedLocalStaff(owner);
// Starts empty, like a real deployment. `--sample` adds example content (used by the automated tests).
if (args.has("--sample") && (await seedSampleContent(owner))) console.log("[db] added sample content");
await owner.end();

const auth = await startMockAuth({ port: AUTH_PORT, users: LOCAL_USERS });

const env = {
  ...process.env,
  APP_ENV: "development",
  DATABASE_URL: db.appUrl,
  SUPABASE_URL: auth.url,
  SUPABASE_PUBLISHABLE_KEY: "local-development-key",
  ANON_ID_SECRET: process.env.LOCAL_ANON_ID_SECRET || "local-development-only-secret-do-not-use-in-production",
  SITE_URL: process.env.SITE_URL || `http://localhost:${APP_PORT}`,
  TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  PORT: String(APP_PORT),
};

const nextArgs = args.has("--production") ? ["next", "start", "-p", String(APP_PORT)] : ["next", "dev", "-p", String(APP_PORT)];
const next = spawn("npx", nextArgs, { cwd: root, env, stdio: "inherit" });

console.log(`
  Connect-Ask (local)          http://localhost:${APP_PORT}
  Admin sign-in                http://localhost:${APP_PORT}/admin/login
    admin      ${LOCAL_USERS[0].email} / ${LOCAL_USERS[0].password}
    moderator  ${LOCAL_USERS[1].email} / ${LOCAL_USERS[1].password}
  Local database and sign-in only. Nothing here touches Supabase or production.
`);

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  next.kill("SIGINT");
  await auth.close();
  await db.stop();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
next.on("exit", (code) => shutdown(code ?? 0));
