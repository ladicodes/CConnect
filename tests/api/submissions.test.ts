import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { insertQuestion, ownerSql, resetData, uuid } from "../support/db";

const ORIGIN = "http://localhost:3000";
const owner = ownerSql();

type Handler = (request: Request, context?: unknown) => Promise<Response>;
let postQuestion: Handler;
let postContext: Handler;
let postPrayer: Handler;
let postTestimony: Handler;
let postSupport: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("appUrl");
  process.env.ANON_ID_SECRET = "test-secret-that-is-long-enough-for-hmac-keys";
  process.env.SITE_URL = ORIGIN;
  postQuestion = (await import("@/app/api/questions/route")).POST;
  postContext = (await import("@/app/api/context/route")).POST;
  postPrayer = (await import("@/app/api/prayer/route")).POST;
  postTestimony = (await import("@/app/api/testimonies/route")).POST;
  postSupport = (await import("@/app/api/questions/[id]/support/route")).POST;
});
afterAll(async () => {
  await owner.end();
  await globalThis.__connectAskSql?.end();
});
beforeEach(() => resetData(owner));

function request(path: string, body: unknown, options: { origin?: string | null; cookie?: string; ip?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = { "content-type": options.contentType ?? "application/json", "x-real-ip": options.ip ?? "203.0.113.10" };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const cookieFrom = (response: Response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";
const count = async (table: string) => (await owner.unsafe(`select count(*)::int as n from app.${table}`))[0].n as number;

describe("POST /api/questions", () => {
  it("saves a valid question as pending and only then reports success", async () => {
    const response = await postQuestion(request("/api/questions", { clientId: uuid(), body: "  What does grace look like at work?  " }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toMatch(/^ca_anon=[\w-]{43}; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax/);
    const [row] = await owner`select body, visibility from app.questions`;
    expect(row).toEqual({ body: "What does grace look like at work?", visibility: "pending" });
  });

  it("ignores attempts to choose moderation fields", async () => {
    await postQuestion(request("/api/questions", { clientId: uuid(), body: "Make me public please", visibility: "public", answer_status: "answered" }));
    const [row] = await owner`select visibility, answer_status from app.questions`;
    expect(row).toEqual({ visibility: "pending", answer_status: "open" });
  });

  it("is idempotent: a retry with the same id does not duplicate", async () => {
    const clientId = uuid();
    const first = await postQuestion(request("/api/questions", { clientId, body: "Retry me safely" }));
    const second = await postQuestion(request("/api/questions", { clientId, body: "Retry me safely" }, { cookie: cookieFrom(first) }));
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await count("questions")).toBe(1);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "     "],
    ["too short", "Hi"],
    ["meaningless", "?!?!?!"],
    ["one repeated letter", "aaaaaaaaaa"],
    ["too long", "a b ".repeat(400)],
  ])("rejects %s input with a field message", async (_label, body) => {
    const response = await postQuestion(request("/api/questions", { clientId: uuid(), body }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toMatchObject({ ok: false, code: "INVALID", field: "body", retryable: false });
    expect(await count("questions")).toBe(0);
  });

  it("blocks cross-site posts", async () => {
    const evil = await postQuestion(request("/api/questions", { clientId: uuid(), body: "Cross site question" }, { origin: "https://evil.example" }));
    const none = await postQuestion(request("/api/questions", { clientId: uuid(), body: "No origin question" }, { origin: null }));
    expect([evil.status, none.status]).toEqual([403, 403]);
    expect(await count("questions")).toBe(0);
  });

  it("requires JSON and limits size", async () => {
    expect((await postQuestion(request("/api/questions", "body=hello", { contentType: "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect((await postQuestion(request("/api/questions", "{not json", {}))).status).toBe(400);
    expect((await postQuestion(request("/api/questions", { clientId: uuid(), body: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("rejects the honeypot without saving", async () => {
    const response = await postQuestion(request("/api/questions", { clientId: uuid(), body: "I am a robot question", website: "http://spam" }));
    expect(response.status).toBe(400);
    expect(await count("questions")).toBe(0);
  });

  it("never reports success when configuration is missing", async () => {
    const saved = process.env.ANON_ID_SECRET;
    delete process.env.ANON_ID_SECRET;
    try {
      const response = await postQuestion(request("/api/questions", { clientId: uuid(), body: "Will this be saved?" }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, retryable: true });
      expect(await count("questions")).toBe(0);
    } finally {
      process.env.ANON_ID_SECRET = saved;
    }
  });
});

describe("rate limiting on shared church Wi-Fi", () => {
  it("limits one browser but not other people on the same network", async () => {
    const ip = "198.51.100.77";
    let cookie = "";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await postQuestion(request("/api/questions", { clientId: uuid(), body: `Question number ${i} from one phone` }, { ip, cookie }));
      cookie ||= cookieFrom(response);
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);

    // Thirty other phones behind the same church IP are unaffected.
    const others = await Promise.all(
      Array.from({ length: 30 }, (_, i) => postQuestion(request("/api/questions", { clientId: uuid(), body: `Another member question ${i}` }, { ip }))),
    );
    expect(others.every((r) => r.status === 201)).toBe(true);
    expect(await count("questions")).toBe(40);
  });
});

describe("other submissions", () => {
  it("links context to a public question, and refuses non-public ones", async () => {
    const publicQ = await insertQuestion(owner, { visibility: "public" });
    const privateQ = await insertQuestion(owner, { visibility: "private" });
    expect((await postContext(request("/api/context", { clientId: uuid(), body: "Helpful linked context", questionId: publicQ }))).status).toBe(201);
    const refused = await postContext(request("/api/context", { clientId: uuid(), body: "Context for a private one", questionId: privateQ }));
    expect(refused.status).toBe(409);
    expect((await postContext(request("/api/context", { clientId: uuid(), body: "Independent context note" }))).status).toBe(201);
    const rows = await owner`select question_id, status from app.context_notes order by created_at`;
    expect(rows).toEqual([
      { question_id: publicQ, status: "pending" },
      { question_id: null, status: "pending" },
    ]);
  });

  it("saves prayer requests privately", async () => {
    expect((await postPrayer(request("/api/prayer", { clientId: uuid(), body: "Please pray for my mother" }))).status).toBe(201);
    expect((await owner`select status from app.prayer_requests`)[0].status).toBe("new");
  });

  it("records testimony consent exactly as chosen and never publishes on submit", async () => {
    await postTestimony(request("/api/testimonies", { clientId: uuid(), kind: "testimony", body: "God made a way for me", displayName: " Ada ", shareConsent: true }));
    await postTestimony(request("/api/testimonies", { clientId: uuid(), kind: "thanksgiving", body: "Thankful for this week", shareConsent: false }));
    const rows = await owner`select display_name, share_consent, status from app.testimonies order by created_at`;
    expect(rows).toEqual([
      { display_name: "Ada", share_consent: true, status: "pending" },
      { display_name: null, share_consent: false, status: "pending" },
    ]);
  });

  it("requires an explicit sharing choice for testimonies", async () => {
    const response = await postTestimony(request("/api/testimonies", { clientId: uuid(), kind: "testimony", body: "No choice given here" }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/questions/:id/support", () => {
  const support = (id: string, supported: boolean, cookie = "") =>
    postSupport(request(`/api/questions/${id}/support`, { supported }, { cookie }), { params: Promise.resolve({ id }) });

  it("supports, ignores repeats, and un-supports", async () => {
    const id = await insertQuestion(owner, { visibility: "public" });
    const first = await support(id, true);
    const cookie = cookieFrom(first);
    expect(await first.json()).toEqual({ ok: true, supported: true, supportCount: 1 });
    expect(await (await support(id, true, cookie)).json()).toEqual({ ok: true, supported: true, supportCount: 1 });
    expect(await (await support(id, true)).json()).toEqual({ ok: true, supported: true, supportCount: 2 });
    expect(await (await support(id, false, cookie)).json()).toEqual({ ok: true, supported: false, supportCount: 1 });
  });

  it("refuses questions that are not public, and malformed ids", async () => {
    const pending = await insertQuestion(owner);
    expect((await support(pending, true)).status).toBe(404);
    expect((await support("not-a-uuid", true)).status).toBe(404);
  });
});
