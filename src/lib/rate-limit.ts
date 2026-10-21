import "server-only";
import type { Tx } from "@/lib/db";
import { keyedHash } from "@/lib/anon-id";

/**
 * Two layers of fixed-window limits, both stored as HMACs (never raw values):
 *
 * - per browser: tight enough to stop a script hammering the form;
 * - per network: deliberately generous, because during a service hundreds of
 *   phones share the church Wi-Fi's single public IP address. This only stops
 *   floods, never a congregation.
 */
export const LIMITS = {
  submit: { browser: 10, network: 400, windowSeconds: 600 },
  support: { browser: 120, network: 5000, windowSeconds: 600 },
} as const;

export type LimitKind = keyof typeof LIMITS;

export function clientNetwork(request: Request): string {
  // On Vercel, x-real-ip / x-forwarded-for are set by the platform.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export async function withinRateLimit(
  tx: Tx,
  secret: string,
  kind: LimitKind,
  anonId: string,
  network: string,
): Promise<boolean> {
  const limit = LIMITS[kind];
  const browserBucket = `${kind}:b:${keyedHash(secret, `rl-browser-${kind}`, anonId).slice(0, 40)}`;
  const networkBucket = `${kind}:n:${keyedHash(secret, `rl-network-${kind}`, network).slice(0, 40)}`;
  const [row] = await tx<{ browser: boolean; network: boolean }[]>`
    select
      app.rate_limit_hit(${browserBucket}, ${limit.browser}, ${limit.windowSeconds}) as browser,
      app.rate_limit_hit(${networkBucket}, ${limit.network}, ${limit.windowSeconds}) as network
  `;
  return Boolean(row?.browser && row?.network);
}
