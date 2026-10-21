import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // Server-only modules are tested directly in Node; the guard targets bundlers.
  "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts", "tests/api/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-db.ts"],
          // One shared database: run files one after another, tests inside may still be concurrent.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
