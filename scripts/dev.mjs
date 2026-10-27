#!/usr/bin/env node
// `npm run dev`          real Supabase if .env.local has Supabase settings,
//                        otherwise the built-in local database + stand-in sign-in
// `npm run dev:supabase` real Supabase only (never the stand-in)
// `npm run dev:local`    built-in local database + stand-in sign-in only
//
// There is no silent fallback: if Supabase settings are present but incomplete,
// this stops and says what to fix instead of quietly using the stand-in.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseMode, mergeEnv, readEnvFile, supabaseProblems } from "./dev-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const strictSupabase = args.includes("--supabase");
const nextArgs = args.filter((arg) => arg !== "--supabase");

const env = mergeEnv(readEnvFile(path.join(root, ".env.local")), process.env);
const mode = strictSupabase ? "supabase" : chooseMode(env);

if (mode === "supabase") {
  const problems = supabaseProblems(env);
  if (problems.length) {
    console.error("\n  Connect-Ask is set to use your Supabase project, but .env.local needs fixing:\n");
    for (const problem of problems) console.error(`   • ${problem}`);
    console.error(
      "\n  Nothing was started. (To try the app without Supabase instead, run `npm run dev:local`.)\n",
    );
    process.exit(1);
  }
  console.log(`\n  Using your Supabase project (${new URL(env.SUPABASE_URL).hostname}) for data and staff sign-in.\n`);
  const child = spawn("npx", ["next", "dev", ...nextArgs], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.log("\n  No Supabase settings in .env.local, so starting the built-in local database and STAND-IN sign-in.");
  console.log("  Only the local test accounts can sign in. Add your Supabase settings to .env.local to use real sign-in.\n");
  await import("./local/dev.mjs");
}
