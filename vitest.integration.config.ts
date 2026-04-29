import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the integration lane.
 *
 * Lives separately so the default `pnpm test` stays Docker-free for laptops
 * that don't run the testcontainers cases. CI runs both lanes; the
 * integration lane has its own job that brings up Docker.
 *
 * Tests under `test/integration/**` boot a real Postgres (Testcontainers)
 * before the suite runs and shut it down after, so the per-suite startup
 * cost is amortised across all integration cases.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.{test,spec}.ts"],
    globals: false,
    // Testcontainers cold-start dominates wall-clock; give each test room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
