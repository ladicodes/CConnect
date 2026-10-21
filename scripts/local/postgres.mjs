// A private Postgres server for local development and tests, run from
// node_modules (no Docker, no system install). Never used in production.
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { existsSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { applyMigrations } from "../db/migrations.mjs";

export const LOCAL_APP_PASSWORD = "connect-ask-local-only";

/** True when something is already listening on this local port. */
export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Removes a lock file left behind by a previous run that was killed. */
function clearStaleLock(dataDir, log) {
  const lock = path.join(dataDir, "postmaster.pid");
  if (!existsSync(lock)) return;
  const pid = Number(readFileSync(lock, "utf8").split("\n")[0]);
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  if (!alive) {
    rmSync(lock, { force: true });
    log("Removed a stale lock from a previous run.");
  }
}

/**
 * Starts Postgres, applies migrations and enables the app login role.
 * @param {{ dataDir: string, port: number, persistent?: boolean, log?: (m: string) => void }} options
 */
export async function startLocalDatabase({ dataDir, port, persistent = true, log = () => {} }) {
  if (await portInUse(port)) {
    throw new Error(
      `Port ${port} is already in use, so the local database can't start. ` +
        "Another Connect-Ask dev server is probably still running: stop it with Ctrl+C in its terminal " +
        `(or find it with: lsof -i :${port}), then try again.`,
    );
  }
  clearStaleLock(dataDir, log);
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent,
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    log("Creating local database ...");
    await server.initialise();
  }
  try {
    await server.start();
  } catch (cause) {
    throw new Error(
      `The local database failed to start${cause instanceof Error ? `: ${cause.message}` : ""}. ` +
        "If this keeps happening, run `npm run dev -- --reset` to recreate it (this deletes local sample data only).",
    );
  }

  const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const appUrl = `postgres://connect_ask_app:${LOCAL_APP_PASSWORD}@127.0.0.1:${port}/postgres`;
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(sql, { log });
    await sql.unsafe(`alter role connect_ask_app with login password '${LOCAL_APP_PASSWORD}'`);
  } finally {
    await sql.end();
  }
  return {
    adminUrl,
    appUrl,
    async stop() {
      await server.stop();
    },
  };
}
