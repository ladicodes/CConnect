import "server-only";

/**
 * Runtime configuration. Everything is read on the server at request time, so
 * nothing here is baked into the browser bundle.
 */

export type DeploymentStage = "development" | "preview" | "production";

export function deploymentStage(): DeploymentStage {
  const explicit = process.env.APP_ENV?.trim();
  if (explicit === "production" || explicit === "preview" || explicit === "development") return explicit;
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  return "development";
}

function read(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/;

export function isLocalHostname(hostname: string): boolean {
  return PRIVATE_HOST.test(hostname) || hostname.endsWith(".local");
}

export type SiteUrlResult =
  | { ok: true; url: string; origin: string; warning?: string }
  | { ok: false; problem: string };

/** The permanent public address used for links and the QR code. */
export function siteUrl(stage: DeploymentStage = deploymentStage()): SiteUrlResult {
  const raw = read("SITE_URL");
  if (!raw) {
    if (stage === "production") return { ok: false, problem: "SITE_URL is not set." };
    return { ok: true, url: "http://localhost:3000", origin: "http://localhost:3000", warning: "SITE_URL is not set, so the development address is used." };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, problem: "SITE_URL is not a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, problem: "SITE_URL must start with https://." };
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return { ok: false, problem: "SITE_URL must be just the address, with no path (for example https://ask.example.org)." };
  }
  if (stage === "production") {
    if (parsed.protocol !== "https:") return { ok: false, problem: "SITE_URL must use https:// in production." };
    if (isLocalHostname(parsed.hostname)) {
      return { ok: false, problem: "SITE_URL points to a local or private address, which phones cannot open." };
    }
  }
  const origin = parsed.origin;
  const warning =
    stage !== "production" && isLocalHostname(parsed.hostname)
      ? "This is a local development address. Phones on other networks cannot open it."
      : undefined;
  return { ok: true, url: origin, origin, warning };
}

export type ConfigCheck = { name: string; ok: boolean; problem?: string };

/** Names and problems only, never values. Safe to show to signed-in staff. */
export function configChecks(stage: DeploymentStage = deploymentStage()): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  const database = read("DATABASE_URL");
  checks.push(database ? { name: "DATABASE_URL", ok: true } : { name: "DATABASE_URL", ok: false, problem: "Not set." });

  const supabaseUrl = read("SUPABASE_URL");
  if (!supabaseUrl) {
    checks.push({ name: "SUPABASE_URL", ok: false, problem: "Not set." });
  } else {
    try {
      const parsed = new URL(supabaseUrl);
      if (stage === "production" && (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname))) {
        checks.push({ name: "SUPABASE_URL", ok: false, problem: "Must be the HTTPS address of the production Supabase project." });
      } else {
        checks.push({ name: "SUPABASE_URL", ok: true });
      }
    } catch {
      checks.push({ name: "SUPABASE_URL", ok: false, problem: "Not a valid URL." });
    }
  }

  checks.push(
    supabaseKey()
      ? { name: "SUPABASE_PUBLISHABLE_KEY", ok: true }
      : { name: "SUPABASE_PUBLISHABLE_KEY", ok: false, problem: "Not set." },
  );

  const secret = read("ANON_ID_SECRET");
  checks.push(
    secret.length >= 32
      ? { name: "ANON_ID_SECRET", ok: true }
      : { name: "ANON_ID_SECRET", ok: false, problem: secret ? "Must be at least 32 characters." : "Not set." },
  );

  const site = siteUrl(stage);
  checks.push(site.ok ? { name: "SITE_URL", ok: true, problem: site.warning } : { name: "SITE_URL", ok: false, problem: site.problem });

  const turnstileSite = read("TURNSTILE_SITE_KEY");
  const turnstileSecret = read("TURNSTILE_SECRET_KEY");
  if (turnstileSite || turnstileSecret) {
    if (!turnstileSite || !turnstileSecret) {
      checks.push({ name: "TURNSTILE", ok: false, problem: "Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither." });
    } else if (stage === "production" && (isTurnstileTestKey(turnstileSite) || isTurnstileTestKey(turnstileSecret))) {
      checks.push({ name: "TURNSTILE", ok: false, problem: "Cloudflare test keys cannot be used in production." });
    } else {
      checks.push({ name: "TURNSTILE", ok: true });
    }
  }
  return checks;
}

export type AuthServiceResult = { ok: true; url: string; key: string } | { ok: false; problem: string };

/**
 * The Supabase Auth address to use. In production this only ever accepts a
 * real HTTPS address that is not local or private, so a development stand-in
 * (like the one `npm run dev:local` starts on 127.0.0.1) can never be used to
 * sign in to a deployed site, even if it were misconfigured.
 */
export function authService(stage: DeploymentStage = deploymentStage()): AuthServiceResult {
  const raw = read("SUPABASE_URL");
  const key = supabaseKey();
  if (!raw || !key) return { ok: false, problem: "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must both be set." };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, problem: "SUPABASE_URL is not a valid address." };
  }
  if (stage === "production" && (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname))) {
    return { ok: false, problem: "In production, SUPABASE_URL must be the HTTPS address of a real Supabase project." };
  }
  return { ok: true, url: parsed.origin, key };
}

export function supabaseKey(): string {
  return read("SUPABASE_PUBLISHABLE_KEY") || read("SUPABASE_ANON_KEY");
}

export function anonIdSecret(): string | null {
  const secret = read("ANON_ID_SECRET");
  return secret.length >= 32 ? secret : null;
}

export function isTurnstileTestKey(value: string): boolean {
  return /^[123]x0{5,}/.test(value);
}

export type TurnstileConfig = { enabled: false } | { enabled: true; siteKey: string; secretKey: string };

export function turnstileConfig(): TurnstileConfig {
  const siteKey = read("TURNSTILE_SITE_KEY");
  const secretKey = read("TURNSTILE_SECRET_KEY");
  if (!siteKey || !secretKey) return { enabled: false };
  return { enabled: true, siteKey, secretKey };
}

export function appTimezone(): string {
  const zone = read("APP_TIMEZONE") || "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}
