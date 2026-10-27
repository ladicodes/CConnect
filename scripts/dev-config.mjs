// Decides how `npm run dev` runs, from .env.local and the environment.
// Pure functions so the rules are unit tested (tests/unit/dev-config.test.ts).

import { existsSync, readFileSync } from "node:fs";

export const SUPABASE_KEYS = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"];

export function parseEnvFile(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return values;
}

export function readEnvFile(file) {
  return existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
}

/** Environment variables win over .env.local, matching how Next.js loads them. */
export function mergeEnv(fileValues, processEnv) {
  const merged = { ...fileValues };
  for (const [key, value] of Object.entries(processEnv)) if (value !== undefined && value !== "") merged[key] = value;
  return merged;
}

/**
 * "supabase" when any Supabase setting is present (the developer intends to
 * use their real project), otherwise "local" (built-in database + stand-in
 * sign-in). There is deliberately no silent fallback from one to the other.
 */
export function chooseMode(env) {
  return SUPABASE_KEYS.some((key) => (env[key] ?? "").trim()) ? "supabase" : "local";
}

/** Problems that would stop real Supabase sign-in or data access from working. */
export function supabaseProblems(env) {
  const problems = [];
  const supabaseUrl = (env.SUPABASE_URL ?? "").trim();
  if (!supabaseUrl) problems.push("SUPABASE_URL is empty. Use your Project URL, e.g. https://abcd.supabase.co");
  else {
    let parsed = null;
    try {
      parsed = new URL(supabaseUrl);
    } catch {
      problems.push("SUPABASE_URL is not a web address. It should look like https://abcd.supabase.co (not a key).");
    }
    if (parsed && parsed.protocol !== "https:") problems.push("SUPABASE_URL must start with https://");
  }

  const key = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  if (!key) problems.push("SUPABASE_PUBLISHABLE_KEY is empty. Use the publishable key (sb_publishable_…).");
  else if (/^sb_secret_/.test(key)) problems.push("SUPABASE_PUBLISHABLE_KEY contains a SECRET key. Use the publishable key instead.");

  const database = (env.DATABASE_URL ?? "").trim();
  if (!database) problems.push("DATABASE_URL is empty. Use the transaction pooler string with the connect_ask_app login.");
  else {
    let parsed = null;
    try {
      parsed = new URL(database);
    } catch {
      problems.push("DATABASE_URL is not a valid postgresql:// connection string.");
    }
    const user = parsed ? decodeURIComponent(parsed.username) : "";
    if (parsed && !user.startsWith("connect_ask_app")) {
      problems.push(
        `DATABASE_URL signs in as "${user.split(".")[0] || "(none)"}". It must use the connect_ask_app login ` +
          "(user connect_ask_app.<project-ref>), which the app needs to apply its security roles.",
      );
    }
  }

  const secret = (env.ANON_ID_SECRET ?? "").trim();
  if (secret.length < 32) problems.push("ANON_ID_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48");
  return problems;
}
