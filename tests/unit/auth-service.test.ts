import { afterEach, describe, expect, it } from "vitest";
import { authService } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("authService: no development sign-in bypass in production", () => {
  it.each([
    ["the local stand-in", "http://127.0.0.1:54431"],
    ["localhost over https", "https://localhost:54321"],
    ["a private network address", "https://192.168.1.10"],
    ["plain http", "http://abcd.supabase.co"],
  ])("refuses %s in production", (_label, url) => {
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(authService("production").ok).toBe(false);
  });

  it("accepts a real Supabase project in production", () => {
    process.env.SUPABASE_URL = "https://abcd.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(authService("production")).toEqual({ ok: true, url: "https://abcd.supabase.co", key: "sb_publishable_test" });
  });

  it("is refused in production even when APP_ENV is not set, because Vercel production is detected", () => {
    delete process.env.APP_ENV;
    process.env.VERCEL_ENV = "production";
    process.env.SUPABASE_URL = "http://127.0.0.1:54431";
    process.env.SUPABASE_PUBLISHABLE_KEY = "local-development-key";
    expect(authService().ok).toBe(false);
  });

  it("allows the local stand-in only in development", () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:54431";
    process.env.SUPABASE_PUBLISHABLE_KEY = "local-development-key";
    expect(authService("development").ok).toBe(true);
  });

  it("requires both the address and the key", () => {
    process.env.SUPABASE_URL = "https://abcd.supabase.co";
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    expect(authService("development").ok).toBe(false);
  });

  it("rejects a key pasted into the URL field", () => {
    process.env.SUPABASE_URL = "sb_publishable_abc123";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc123";
    expect(authService("development").ok).toBe(false);
  });
});
