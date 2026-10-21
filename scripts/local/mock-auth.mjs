// Local stand-in for Supabase Auth, for development and automated tests only.
//
// It implements the few GoTrue endpoints supabase-js uses for staff sign-in
// (password grant, refresh, get user, logout) so the application code runs
// unchanged against it. It listens on 127.0.0.1 only and keeps users in memory.
// Production configuration checks reject a local SUPABASE_URL.
import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const SECRET = randomBytes(32);
const TOKEN_LIFETIME = 3600;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verify(token) {
  const [header, body, signature] = String(token).split(".");
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  return payload.exp > Date.now() / 1000 ? payload : null;
}

/**
 * @param {{ port: number, users: { id: string, email: string, password: string }[] }} options
 */
export function startMockAuth({ port, users }) {
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const byId = new Map(users.map((user) => [user.id, user]));
  const refreshTokens = new Map();

  const publicUser = (user) => ({
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  const session = (user) => {
    const now = Math.floor(Date.now() / 1000);
    const refresh = randomBytes(24).toString("hex");
    refreshTokens.set(refresh, user.id);
    return {
      access_token: sign({
        sub: user.id,
        email: user.email,
        aud: "authenticated",
        role: "authenticated",
        iat: now,
        exp: now + TOKEN_LIFETIME,
        session_id: randomUUID(),
      }),
      token_type: "bearer",
      expires_in: TOKEN_LIFETIME,
      expires_at: now + TOKEN_LIFETIME,
      refresh_token: refresh,
      user: publicUser(user),
    };
  };

  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const authError = (res, status, code, message) =>
    send(res, status, { code: status, error_code: code, msg: message });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const json = raw ? JSON.parse(raw) : {};

    if (req.method === "POST" && url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const user = byEmail.get(String(json.email ?? "").toLowerCase());
        if (!user || user.password !== json.password) {
          return authError(res, 400, "invalid_credentials", "Invalid login credentials");
        }
        return send(res, 200, session(user));
      }
      if (grant === "refresh_token") {
        const userId = refreshTokens.get(json.refresh_token);
        refreshTokens.delete(json.refresh_token);
        const user = userId && byId.get(userId);
        if (!user) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
        return send(res, 200, session(user));
      }
      return authError(res, 400, "unsupported_grant_type", "Unsupported grant type");
    }

    if (req.method === "GET" && url.pathname === "/auth/v1/user") {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const claims = token && verify(token);
      const user = claims && byId.get(claims.sub);
      if (!user) return authError(res, 401, "bad_jwt", "invalid JWT");
      return send(res, 200, publicUser(user));
    }

    if (req.method === "POST" && url.pathname === "/auth/v1/logout") {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/auth/v1/settings") {
      return send(res, 200, { external: { email: true }, disable_signup: true });
    }

    return authError(res, 404, "not_found", "Not found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}
