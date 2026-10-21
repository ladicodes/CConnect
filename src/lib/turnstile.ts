import "server-only";
import { z } from "zod";
import { deploymentStage, isTurnstileTestKey, siteUrl, turnstileConfig } from "@/lib/env";

/**
 * Optional Cloudflare Turnstile verification. Off unless both keys are set.
 * When on, tokens are verified server-side (Cloudflare rejects reused or
 * expired tokens), and the hostname is checked against SITE_URL in production.
 */

const response = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export type TurnstileResult = { ok: true } | { ok: false; code: string; providerCodes?: string[] };

export async function verifyTurnstile(token: string | undefined, idempotencyKey: string): Promise<TurnstileResult> {
  const config = turnstileConfig();
  if (!config.enabled) return { ok: true };
  if (!token) return { ok: false, code: "TURNSTILE_TOKEN_MISSING" };

  const stage = deploymentStage();
  if (stage === "production" && isTurnstileTestKey(config.secretKey)) {
    return { ok: false, code: "TURNSTILE_TEST_KEY_IN_PRODUCTION" };
  }

  let result: z.infer<typeof response>;
  try {
    const reply = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: config.secretKey, response: token, idempotency_key: idempotencyKey }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!reply.ok) return { ok: false, code: `TURNSTILE_HTTP_${reply.status}` };
    const parsed = response.safeParse(await reply.json());
    if (!parsed.success) return { ok: false, code: "TURNSTILE_MALFORMED_RESPONSE" };
    result = parsed.data;
  } catch {
    return { ok: false, code: "TURNSTILE_UNREACHABLE" };
  }

  if (!result.success) return { ok: false, code: "TURNSTILE_REJECTED", providerCodes: result["error-codes"] };

  if (stage === "production") {
    const site = siteUrl(stage);
    const expected = site.ok ? new URL(site.url).hostname : null;
    if (!expected || result.hostname !== expected) return { ok: false, code: "TURNSTILE_HOSTNAME_MISMATCH" };
  }
  return { ok: true };
}
