import { asPublic, isUuid } from "@/lib/db";
import { anonIdSecret } from "@/lib/env";
import { resolveAnonId, supporterHash } from "@/lib/anon-id";
import { clientNetwork, withinRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, json, readJson } from "@/lib/submissions";
import { supportInput } from "@/lib/validation";
import { errorKind, logEvent, sqlState } from "@/lib/log";

/**
 * "I have this question too". Idempotent: sending {supported: true} twice
 * still counts once (the database has a unique key per question + browser).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json(404, { ok: false, error: "This question isn't on the board." });
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Please use the Connect-Ask website." });

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = supportInput.safeParse(body.value);
  if (!parsed.success) return json(400, { ok: false, error: "Please try again." });

  const secret = anonIdSecret();
  if (!secret || !process.env.DATABASE_URL?.trim()) {
    logEvent("error", "SUPPORT_CONFIG_MISSING");
    return json(503, { ok: false, error: "This isn't available right now. Please try again shortly." });
  }

  const anon = resolveAnonId(request);
  const headers: HeadersInit = anon.setCookie ? { "Set-Cookie": anon.setCookie } : {};
  const supporter = supporterHash(secret, anon.id);

  try {
    const result = await asPublic(async (tx) => {
      const allowed = await withinRateLimit(tx, secret, "support", anon.id, clientNetwork(request));
      if (!allowed) return null;
      const [row] = await tx<{ supported: boolean; support_count: number }[]>`
        select supported, support_count from app.set_support(${id}, ${supporter}, ${parsed.data.supported})
      `;
      return row;
    });
    if (!result) {
      return json(429, { ok: false, error: "That's a lot of taps! Please wait a moment and try again." }, headers);
    }
    return json(200, { ok: true, supported: result.supported, supportCount: result.support_count }, headers);
  } catch (error) {
    if (sqlState(error) === "CA404") {
      return json(404, { ok: false, error: "This question is no longer on the board." }, headers);
    }
    logEvent("error", "SUPPORT_FAILED", { error: errorKind(error) });
    return json(503, { ok: false, error: "That didn't go through. Please try again." }, headers);
  }
}
