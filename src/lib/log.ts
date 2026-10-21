import "server-only";

type Details = Record<string, string | number | boolean | null | undefined | string[]>;

/**
 * Structured server diagnostics. Callers pass codes and non-sensitive facts
 * only: never submission text, tokens, secrets, cookies or IP addresses.
 */
export function logEvent(level: "info" | "warn" | "error", code: string, details: Details = {}) {
  const line = JSON.stringify({ app: "connect-ask", level, code, ...details, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Postgres error code (SQLSTATE) without the message, which may echo input. */
export function sqlState(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined;
  }
  return undefined;
}

export function errorKind(error: unknown): string {
  const state = sqlState(error);
  if (state) return `SQL_${state}`;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    // Network errors from the driver (ECONNREFUSED, CONNECT_TIMEOUT, ...).
    return /^[A-Z_]{3,40}$/.test(error.code) ? error.code : "UNKNOWN";
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}
