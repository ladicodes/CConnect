import "server-only";
import postgres from "postgres";

/**
 * Database access.
 *
 * The server connects as `connect_ask_app`, which has no privileges of its
 * own. Every unit of work runs in a transaction that first switches to one of
 * two roles, so the database itself enforces what each caller may do:
 *
 *   asPublic  -> connect_ask_public: public views and submission functions only
 *   asStaff   -> connect_ask_staff:  row level security keyed on the verified user id
 */

export type Tx = postgres.TransactionSql;

declare global {
  var __connectAskSql: postgres.Sql | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DatabaseNotConfiguredError";
  }
}

function sslMode(url: string): false | "require" {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" ? false : "require";
  } catch {
    return "require";
  }
}

function client(): postgres.Sql {
  if (globalThis.__connectAskSql) return globalThis.__connectAskSql;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: sslMode(url),
    onnotice: () => {},
    connection: { application_name: "connect-ask" },
  });
  // Reused across hot reloads in development and across invocations of a warm
  // serverless instance in production.
  globalThis.__connectAskSql = sql;
  return sql;
}

const STATEMENT_TIMEOUT = "8s";

export async function asPublic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await client().begin(async (tx) => {
    await tx`set local role connect_ask_public`;
    await tx`select set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`;
    return work(tx);
  });
  return result as T;
}

export async function asStaff<T>(userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await client().begin(async (tx) => {
    await tx`set local role connect_ask_staff`;
    await tx`select set_config('app.user_id', ${userId}, true), set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`;
    return work(tx);
  });
  return result as T;
}

/** Lightweight connectivity check used by the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await asPublic((tx) => tx`select 1 from app.public_active_session limit 1`);
    return true;
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
