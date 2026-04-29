import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub Next's `server-only` package so it can be imported from vitest.
      // Modules that import it are still server-only at runtime — this just
      // prevents the import from blowing up under Node test environments.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["e2e/**", "test/integration/**", "node_modules/**", ".next/**"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/domain/**/*.ts",
        "src/lib/fsm/**/*.ts",
        "src/lib/ai/**/*.ts",
      ],
      exclude: ["src/lib/db/migrations/**", "**/*.test.ts"],
      // Hard floors. Below this, CI fails. Floors are conservative — tests
      // should generally run higher; the floor catches regressions, not perfection.
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
