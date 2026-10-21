import { describe, expect, it } from "vitest";
import { anonCookieHeader, isValidAnonId, keyedHash, newAnonId, readCookie, resolveAnonId, supporterHash } from "@/lib/anon-id";

describe("anonymous browser id", () => {
  it("is random, opaque and well-formed", () => {
    const a = newAnonId();
    expect(isValidAnonId(a)).toBe(true);
    expect(a).not.toBe(newAnonId());
    expect(isValidAnonId("short")).toBe(false);
    expect(isValidAnonId("x".repeat(43) + ";")).toBe(false);
  });

  it("is never stored raw: hashes depend on the server secret and purpose", () => {
    const id = newAnonId();
    expect(supporterHash("secret-one-secret-one-secret-one-1", id)).toMatch(/^[0-9a-f]{64}$/);
    expect(supporterHash("secret-one-secret-one-secret-one-1", id)).not.toBe(supporterHash("secret-two-secret-two-secret-two-2", id));
    expect(keyedHash("s", "support", id)).not.toBe(keyedHash("s", "rl-browser-submit", id));
  });

  it("reuses a valid cookie and replaces a tampered one", () => {
    const id = newAnonId();
    const reuse = resolveAnonId(new Request("https://ask.example.org/x", { headers: { cookie: `a=1; ca_anon=${id}` } }));
    expect(reuse).toEqual({ id });
    const fresh = resolveAnonId(new Request("https://ask.example.org/x", { headers: { cookie: "ca_anon=evil" } }));
    expect(fresh.id).not.toBe("evil");
    expect(fresh.setCookie).toContain("Secure");
  });

  it("sets a hardened cookie", () => {
    expect(anonCookieHeader("abc", true)).toBe("ca_anon=abc; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure");
    expect(readCookie("x=1; ca_anon=%E0%A4%A", "ca_anon")).toBeUndefined();
  });
});
