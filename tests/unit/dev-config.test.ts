import { describe, expect, it } from "vitest";
import { chooseMode, mergeEnv, parseEnvFile, supabaseProblems } from "../../scripts/dev-config.mjs";

const good = {
  DATABASE_URL: "postgresql://connect_ask_app.abcd:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  SUPABASE_URL: "https://abcd.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  ANON_ID_SECRET: "x".repeat(40),
};

describe("npm run dev mode selection", () => {
  it("uses the stand-in only when no Supabase settings exist at all", () => {
    expect(chooseMode({})).toBe("local");
    expect(chooseMode({ SITE_URL: "http://localhost:3000" })).toBe("local");
  });

  it("never silently falls back once any Supabase setting is present", () => {
    expect(chooseMode({ SUPABASE_URL: "https://abcd.supabase.co" })).toBe("supabase");
    expect(chooseMode({ SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" })).toBe("supabase");
    expect(chooseMode({ DATABASE_URL: "postgresql://x" })).toBe("supabase");
  });

  it("accepts a complete, correct configuration", () => {
    expect(supabaseProblems(good)).toEqual([]);
  });

  it("explains each common mistake", () => {
    const text = supabaseProblems({
      DATABASE_URL: "postgresql://postgres.abcd:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
      SUPABASE_URL: "sb_publishable_abc",
      SUPABASE_PUBLISHABLE_KEY: "",
      ANON_ID_SECRET: "",
    }).join("\n");
    expect(text).toContain("SUPABASE_URL is not a web address");
    expect(text).toContain("SUPABASE_PUBLISHABLE_KEY is empty");
    expect(text).toContain('signs in as "postgres"');
    expect(text).toContain("ANON_ID_SECRET");
  });

  it("refuses a secret key in the publishable slot", () => {
    expect(supabaseProblems({ ...good, SUPABASE_PUBLISHABLE_KEY: "sb_secret_xyz" }).join()).toContain("SECRET");
  });
});

describe(".env.local parsing", () => {
  it("handles quotes, spaces around = and comments", () => {
    const parsed = parseEnvFile('# comment\nA= "one"\nB=two\nC = \'three\'\nD=\n');
    expect(parsed).toEqual({ A: "one", B: "two", C: "three", D: "" });
  });

  it("lets real environment variables override the file, like Next.js", () => {
    expect(mergeEnv({ A: "file" }, { A: "env", B: undefined })).toEqual({ A: "env" });
  });
});
