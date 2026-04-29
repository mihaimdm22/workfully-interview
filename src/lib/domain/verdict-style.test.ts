import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verdictStyle } from "./verdict-style";

/**
 * Drift guard: the constants in verdict-style.ts must match the CSS variables
 * in globals.css. If you change a hex value in one place but not the other,
 * dashboard cards will look one color and the OG share image will look
 * another. This test compares the two sources and fails the build on drift.
 */

const globalsCss = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8",
);

function lightModeValue(varName: string): string {
  // Match `--name: #hex;` in the :root { } block before the dark-mode block.
  // Crude but sufficient: the file's :root block is only ~30 lines.
  const rootBlock = globalsCss.split("@media (prefers-color-scheme: dark)")[0]!;
  const re = new RegExp(`--${varName}:\\s*([^;]+);`);
  const m = rootBlock.match(re);
  if (!m) throw new Error(`CSS variable --${varName} not found in :root`);
  return m[1]!.trim().toLowerCase();
}

describe("verdict-style ↔ globals.css drift", () => {
  for (const [verdict, s] of Object.entries(verdictStyle)) {
    it(`${verdict}: --${s.cssVar} matches verdictStyle.${verdict}.color`, () => {
      const css = lightModeValue(s.cssVar);
      expect(css).toBe(s.color);
    });
  }
});
