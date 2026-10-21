import { describe, expect, it } from "vitest";
import { LIMITS, characterCount, checkBody, isMeaningful, normalizeName, normalizeText } from "@/lib/text";
import { questionInput, testimonyInput } from "@/lib/validation";

describe("normalizeText", () => {
  it("trims, unifies newlines and collapses blank runs", () => {
    expect(normalizeText("  Hello\r\nworld  \n\n\n\nAgain  ")).toBe("Hello\nworld\n\nAgain");
  });
  it("removes control and invisible characters", () => {
    expect(normalizeText("Hi\u0000 there​‮ friend")).toBe("Hi there friend");
  });
  it("normalises Unicode so lengths match the database", () => {
    expect(normalizeText("Café")).toBe("Café");
  });
});

describe("checkBody", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["ok", "too_short"],
    ["...!!!", "meaningless"],
    ["zzzzzzzz", "meaningless"],
    ["Why pray?", null],
    ["Ọlọ́run ń gbọ́ àdúrà?", null],
  ])("%j -> %s", (input, expected) => {
    expect(checkBody(input, LIMITS.question)).toBe(expected);
  });

  it("counts characters as code points (emoji count once)", () => {
    expect(characterCount("🙏🙏")).toBe(2);
    expect(checkBody("🙏".repeat(1001) + " ok", LIMITS.question)).toBe("too_long");
  });

  it("accepts numbers and other scripts as meaningful", () => {
    expect(isMeaningful("John 3:16?")).toBe(true);
    expect(isMeaningful("¿Por qué?")).toBe(true);
  });
});

describe("schemas", () => {
  it("normalises the question body on the server", () => {
    const parsed = questionInput.parse({ clientId: "0f3b6a52-1d2e-4c55-9f6a-0d1b2c3d4e5f", body: "  A question  " });
    expect(parsed.body).toBe("A question");
    expect(parsed.website).toBe("");
  });
  it("rejects a non-uuid submission id", () => {
    expect(questionInput.safeParse({ clientId: "1", body: "A real question" }).success).toBe(false);
  });
  it("cleans and limits testimony names", () => {
    const base = { clientId: "0f3b6a52-1d2e-4c55-9f6a-0d1b2c3d4e5f", kind: "testimony", body: "A testimony here", shareConsent: false };
    expect(testimonyInput.parse({ ...base, displayName: "  Ada   O. " }).displayName).toBe("Ada O.");
    expect(testimonyInput.safeParse({ ...base, displayName: "x".repeat(61) }).success).toBe(false);
    expect(normalizeName("\u0000Bo")).toBe("Bo");
  });
});
