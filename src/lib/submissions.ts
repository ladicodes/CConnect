import "server-only";
import type { z } from "zod";
import { asPublic, type Tx } from "@/lib/db";
import { anonIdSecret, siteUrl } from "@/lib/env";
import { resolveAnonId } from "@/lib/anon-id";
import { clientNetwork, withinRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { firstIssue } from "@/lib/validation";
import { errorKind, logEvent, sqlState } from "@/lib/log";
import type { SubmissionKind } from "@/lib/text";

export type SubmissionFailure = {
  ok: false;
  code: string;
  error: string;
  field?: string;
  /** True when sending the same message again may succeed. */
  retryable: boolean;
};
export type SubmissionResponse = { ok: true } | SubmissionFailure;

const MAX_BODY_BYTES = 16 * 1024;

const MESSAGES = {
  unavailable:
    "Connect-Ask can't accept messages right this moment. Your message is still here, so please try again shortly.",
  generic: "We couldn't send that. Your message is still here, so please try again.",
  limited: "You've sent several messages in a short time. Please wait a few minutes, then try again.",
  verification: "We couldn't confirm this was sent by a person. Please try again.",
  origin: "Please send this from the Connect-Ask website.",
} as const;

export function json(status: number, body: SubmissionResponse | Record<string, unknown>, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function fail(code: string, error: string, retryable: boolean, field?: string): SubmissionFailure {
  return { ok: false, code, error, retryable, ...(field ? { field } : {}) };
}

/**
 * Blocks cross-site form posts (CSRF). Browsers always send Origin on fetch
 * POSTs; JSON-only bodies additionally force a CORS preflight cross-origin.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const allowed = new Set([new URL(request.url).origin]);
  const site = siteUrl();
  if (site.ok) allowed.add(site.origin);
  return allowed.has(origin);
}

export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false, response: json(415, fail("UNSUPPORTED", MESSAGES.generic, false)) };
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: json(413, fail("TOO_LARGE", "That message is too long to send.", false)) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json(413, fail("TOO_LARGE", "That message is too long to send.", false)) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: json(400, fail("MALFORMED", MESSAGES.generic, true)) };
  }
}

type BaseInput = { clientId: string; website: string; turnstileToken?: string };

export type SubmissionSpec<S extends z.ZodType<BaseInput>> = {
  kind: SubmissionKind;
  schema: S;
  insert: (tx: Tx, input: z.infer<S>) => Promise<unknown>;
};

export async function handleSubmission<S extends z.ZodType<BaseInput>>(
  request: Request,
  spec: SubmissionSpec<S>,
): Promise<Response> {
  const { kind } = spec;
  if (!isSameOrigin(request)) {
    logEvent("warn", "SUBMIT_CROSS_ORIGIN", { kind });
    return json(403, fail("FORBIDDEN", MESSAGES.origin, false));
  }

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = spec.schema.safeParse(body.value);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return json(400, fail("INVALID", issue.message, false, issue.field));
  }
  const input = parsed.data;

  if (input.website) {
    logEvent("warn", "SUBMIT_HONEYPOT", { kind });
    return json(400, fail("REJECTED", MESSAGES.generic, false));
  }

  const secret = anonIdSecret();
  if (!secret || !process.env.DATABASE_URL?.trim()) {
    logEvent("error", "SUBMIT_CONFIG_MISSING", {
      kind,
      missing: [!secret ? "ANON_ID_SECRET" : "", !process.env.DATABASE_URL?.trim() ? "DATABASE_URL" : ""].filter(Boolean),
    });
    return json(503, fail("UNAVAILABLE", MESSAGES.unavailable, true));
  }

  const verification = await verifyTurnstile(input.turnstileToken, input.clientId);
  if (!verification.ok) {
    logEvent("warn", verification.code, { kind, providerCodes: verification.providerCodes });
    return json(400, fail("VERIFICATION_FAILED", MESSAGES.verification, true));
  }

  const anon = resolveAnonId(request);
  const headers: HeadersInit = anon.setCookie ? { "Set-Cookie": anon.setCookie } : {};

  try {
    const outcome = await asPublic(async (tx) => {
      const allowed = await withinRateLimit(tx, secret, "submit", anon.id, clientNetwork(request));
      if (!allowed) return "limited" as const;
      await spec.insert(tx, input);
      return "saved" as const;
    });

    if (outcome === "limited") {
      logEvent("warn", "SUBMIT_RATE_LIMITED", { kind });
      return json(429, fail("RATE_LIMITED", MESSAGES.limited, true), { ...headers, "Retry-After": "120" });
    }
    // The transaction has committed: the submission is genuinely saved.
    logEvent("info", "SUBMIT_SAVED", { kind });
    return json(201, { ok: true }, headers);
  } catch (error) {
    const state = sqlState(error);
    if (state === "CA404") {
      return json(
        409,
        fail(
          "QUESTION_UNAVAILABLE",
          "That question is no longer open for context. Your note is still here, and you can send it as general context instead.",
          false,
        ),
        headers,
      );
    }
    if (state === "23514" || state === "22001") {
      logEvent("warn", "SUBMIT_REJECTED_BY_DATABASE", { kind, error: errorKind(error) });
      return json(400, fail("INVALID", "Please check your message and try again.", false), headers);
    }
    logEvent("error", "SUBMIT_FAILED", { kind, error: errorKind(error) });
    return json(503, fail("UNAVAILABLE", MESSAGES.generic, true), headers);
  }
}
