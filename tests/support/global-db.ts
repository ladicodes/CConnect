import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { startLocalDatabase } from "../../scripts/local/postgres.mjs";

/** Starts a throwaway Postgres with all migrations applied for the db/api tests. */
export default async function setup(project: TestProject) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "connect-ask-test-"));
  const port = 55000 + Math.floor(Math.random() * 2000);
  const db = await startLocalDatabase({ dataDir, port, persistent: false });
  project.provide("adminUrl", db.adminUrl);
  project.provide("appUrl", db.appUrl);
  return async () => {
    await db.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    appUrl: string;
  }
}
