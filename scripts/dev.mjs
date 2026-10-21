#!/usr/bin/env node
// `npm run dev`
//
// If .env.local (or the environment) configures a real development database,
// run Next.js against it. Otherwise start the self-contained local stack
// (private Postgres + local sign-in + sample data), so the app always works.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

const fileEnv = readEnvFile(path.join(root, ".env.local"));
const configured = Boolean((process.env.DATABASE_URL || fileEnv.DATABASE_URL || "").trim());

if (configured) {
  const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.log("\n  No DATABASE_URL configured, so starting the built-in local database and sign-in.");
  console.log("  (Create .env.local from .env.example to use your Supabase development project instead.)\n");
  await import("./local/dev.mjs");
}
