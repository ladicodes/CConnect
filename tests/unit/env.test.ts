import { afterEach, describe, expect, it } from "vitest";
import { configChecks, deploymentStage, isTurnstileTestKey, siteUrl } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("siteUrl (the address the QR code points to)", () => {
  it("accepts a clean HTTPS address in production", () => {
    process.env.SITE_URL = "https://ask.example.org/";
    expect(siteUrl("production")).toEqual({ ok: true, url: "https://ask.example.org", origin: "https://ask.example.org", warning: undefined });
  });
  it.each([
    ["http://ask.example.org", "https"],
    ["https://localhost:3000", "local or private"],
    ["https://192.168.1.20", "local or private"],
    ["https://10.0.0.5", "local or private"],
    ["https://ask.example.org/connect", "no path"],
    ["not a url", "not a valid URL"],
  ])("rejects %s in production", (value, message) => {
    process.env.SITE_URL = value;
    const result = siteUrl("production");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(message);
  });
  it("refuses to fall back to localhost in production", () => {
    delete process.env.SITE_URL;
    expect(siteUrl("production").ok).toBe(false);
    expect(siteUrl("development")).toMatchObject({ ok: true, url: "http://localhost:3000" });
  });
  it("warns, but allows, local addresses in development", () => {
    process.env.SITE_URL = "http://localhost:3000";
    expect(siteUrl("development")).toMatchObject({ ok: true, warning: expect.stringContaining("local") });
  });
});

describe("deployment stage", () => {
  it("follows Vercel's environment, with APP_ENV as an override", () => {
    delete process.env.APP_ENV;
    process.env.VERCEL_ENV = "preview";
    expect(deploymentStage()).toBe("preview");
    process.env.VERCEL_ENV = "production";
    expect(deploymentStage()).toBe("production");
    process.env.APP_ENV = "development";
    expect(deploymentStage()).toBe("development");
  });
});

describe("configChecks", () => {
  it("reports names and problems only, never values", () => {
    process.env.DATABASE_URL = "postgres://user:super-secret-password@db.example/postgres";
    process.env.SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk_secretish";
    process.env.ANON_ID_SECRET = "short";
    process.env.SITE_URL = "https://ask.example.org";
    const checks = configChecks("production");
    const text = JSON.stringify(checks);
    expect(text).not.toContain("super-secret-password");
    expect(text).not.toContain("pk_secretish");
    expect(checks.find((c) => c.name === "ANON_ID_SECRET")).toMatchObject({ ok: false });
    expect(checks.find((c) => c.name === "SUPABASE_URL")).toMatchObject({ ok: false });
  });
  it("rejects Cloudflare test keys in production and half-configured Turnstile", () => {
    process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    expect(configChecks("production").find((c) => c.name === "TURNSTILE")).toMatchObject({ ok: false });
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(configChecks("development").find((c) => c.name === "TURNSTILE")?.problem).toContain("both");
    expect(isTurnstileTestKey("0x4AAAAAAA")).toBe(false);
  });
});
