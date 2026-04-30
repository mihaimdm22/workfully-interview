import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { styleFor, verdictStyle } from "./verdict-style";

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
  // Pull tokens from the literal `:root { ... }` block. Anchor on `:root`
  // explicitly so reordering or renaming the dark-mode selector
  // (`[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`, etc.)
  // can't accidentally let dark-mode hex values masquerade as the light value.
  const rootMatch = globalsCss.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) throw new Error(":root block not found in globals.css");
  const re = new RegExp(`--${varName}:\\s*([^;]+);`);
  const m = rootMatch[1]!.match(re);
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

describe("styleFor", () => {
  it("returns the matching record for every verdict", () => {
    for (const verdict of Object.keys(verdictStyle) as Array<
      keyof typeof verdictStyle
    >) {
      expect(styleFor(verdict)).toBe(verdictStyle[verdict]);
    }
  });
});
