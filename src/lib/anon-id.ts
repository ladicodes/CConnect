import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Anonymous browser identity.
 *
 * Each browser gets a random id in an httpOnly cookie. It is never linked to a
 * person and never stored raw: the database only sees HMACs of it, so it
 * cannot be reversed or correlated with anything outside Connect-Ask. It is
 * used to remember "I have this question too" and for per-browser rate limits.
 * This is deliberately not fingerprinting: clearing cookies resets it.
 */

export const ANON_COOKIE = "ca_anon";
const ONE_YEAR = 60 * 60 * 24 * 365;

const VALID = /^[A-Za-z0-9_-]{43}$/;

export function newAnonId(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidAnonId(value: string | undefined | null): value is string {
  return typeof value === "string" && VALID.test(value);
}

export function keyedHash(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}\u0000${value}`).digest("hex");
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function anonCookieHeader(id: string, secure: boolean): string {
  return [
    `${ANON_COOKIE}=${id}`,
    "Path=/",
    `Max-Age=${ONE_YEAR}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Reads the browser's anonymous id from a request, creating one if needed. */
export function resolveAnonId(request: Request): { id: string; setCookie?: string } {
  const existing = readCookie(request.headers.get("cookie"), ANON_COOKIE);
  if (isValidAnonId(existing)) return { id: existing };
  const id = newAnonId();
  const secure = new URL(request.url).protocol === "https:";
  return { id, setCookie: anonCookieHeader(id, secure) };
}

export function supporterHash(secret: string, anonId: string): string {
  return keyedHash(secret, "support", anonId);
}
