import { connection } from "next/server";
import { pingDatabase } from "@/lib/db";
import { configChecks, deploymentStage } from "@/lib/env";

/**
 * Public health check for uptime monitoring. Reports only pass/fail, never
 * configuration names or values; staff see details on the admin dashboard.
 */
export async function GET() {
  await connection();
  const configOk = configChecks().every((check) => check.ok);
  const database = configOk ? await pingDatabase() : false;
  const ok = configOk && database;
  return Response.json(
    { ok, stage: deploymentStage(), checks: { configuration: configOk, database } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
