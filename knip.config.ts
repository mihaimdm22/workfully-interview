import type { KnipConfig } from "knip";

/**
 * Knip — finds unused files, exports, and dependencies.
 *
 * Most config files (next/vitest/playwright/eslint/etc.) are auto-detected via
 * plugins, so we only declare entries Knip can't infer.
 */
const config: KnipConfig = {
  entry: [
    "src/app/**/{page,layout,loading,error,not-found,route,actions}.{ts,tsx}",
    "e2e/**/*.spec.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
};

export default config;
