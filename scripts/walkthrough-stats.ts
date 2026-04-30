/**
 * Refresh the committed coverage snapshot used by the /walkthrough stats banner.
 * Reads `coverage/coverage-summary.json` (produced by `pnpm test:coverage`)
 * and writes the rounded statements percentage into the snapshot file.
 *
 * Usage:
 *   pnpm test:coverage         # produces coverage/coverage-summary.json
 *   pnpm walkthrough:stats     # reads it and updates the snapshot
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const COVERAGE_SUMMARY = join(ROOT, "coverage", "coverage-summary.json");
const SNAPSHOT = join(
  ROOT,
  "src",
  "lib",
  "walkthrough",
  ".coverage-snapshot.json",
);

async function main() {
  let raw: string;
  try {
    raw = await readFile(COVERAGE_SUMMARY, "utf8");
  } catch {
    console.error(
      `[walkthrough-stats] coverage/coverage-summary.json not found.\n` +
        `Run \`pnpm test:coverage\` first.`,
    );
    process.exit(1);
  }

  const summary = JSON.parse(raw) as {
    total?: { statements?: { pct?: number } };
  };
  const pct = summary.total?.statements?.pct;
  if (typeof pct !== "number") {
    console.error("[walkthrough-stats] no total.statements.pct in summary");
    process.exit(1);
  }

  const snapshot = {
    _comment:
      "Run `pnpm walkthrough:stats` to refresh after a coverage run. Manually edit only when CI cannot regenerate.",
    statementsPct: Math.round(pct * 10) / 10,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    `[walkthrough-stats] wrote ${SNAPSHOT} (statementsPct=${snapshot.statementsPct})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
