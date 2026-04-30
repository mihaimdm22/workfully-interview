import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countTests,
  countAdrs,
  countLines,
  countDeps,
  readCoverage,
  readAllStats,
} from "./stats";

const FALLBACK_ROOT = "/this/path/does/not/exist/for-stats-tests";

let fixtureRoot: string;

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "wt-stats-"));

  // src/ with one production file (3 lines) and one test file
  await mkdir(join(fixtureRoot, "src", "lib"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "src", "lib", "thing.ts"),
    "export const x = 1;\nexport const y = 2;\nexport const z = 3;\n",
  );
  await writeFile(
    join(fixtureRoot, "src", "lib", "thing.test.ts"),
    "import { it } from 'vitest';\nit('works', () => {});\n",
  );

  // docs/adr/ with two ADR files matching the 4-digit prefix pattern
  await mkdir(join(fixtureRoot, "docs", "adr"), { recursive: true });
  await writeFile(join(fixtureRoot, "docs", "adr", "0001-thing.md"), "# 1\n");
  await writeFile(join(fixtureRoot, "docs", "adr", "0002-other.md"), "# 2\n");
  await writeFile(join(fixtureRoot, "docs", "adr", "README.md"), "# nope\n");

  // package.json with three runtime deps
  await writeFile(
    join(fixtureRoot, "package.json"),
    JSON.stringify({
      dependencies: { a: "1", b: "1", c: "1" },
      devDependencies: { d: "1" },
    }),
  );

  // coverage snapshot
  await mkdir(join(fixtureRoot, "src", "lib", "walkthrough"), {
    recursive: true,
  });
  await writeFile(
    join(fixtureRoot, "src", "lib", "walkthrough", ".coverage-snapshot.json"),
    JSON.stringify({ statementsPct: 87.6 }),
  );
});

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe.each([
  {
    name: "countTests",
    fn: countTests,
    expectedHappy: 1,
  },
  {
    name: "countAdrs",
    fn: countAdrs,
    expectedHappy: 2,
  },
  {
    name: "countLines",
    fn: countLines,
    expectedHappy: 4, // production file only (3 lines + trailing newline); test file excluded
  },
  {
    name: "countDeps",
    fn: countDeps,
    expectedHappy: 3, // dependencies, not devDependencies
  },
  {
    name: "readCoverage",
    fn: readCoverage,
    expectedHappy: 88, // rounded
  },
])("$name", ({ fn, expectedHappy }) => {
  it(`returns the expected count on happy path`, async () => {
    const result = await fn(fixtureRoot);
    expect(result).toBe(expectedHappy);
  });

  it(`returns null when the source is missing`, async () => {
    const result = await fn(FALLBACK_ROOT);
    expect(result).toBeNull();
  });
});

describe("readAllStats", () => {
  it("aggregates all five readers", async () => {
    const stats = await readAllStats(fixtureRoot);
    expect(stats).toEqual({
      tests: 1,
      coverage: 88,
      adrs: 2,
      loc: 4,
      deps: 3,
    });
  });

  it("returns nulls for every stat when the root is missing", async () => {
    const stats = await readAllStats(FALLBACK_ROOT);
    expect(stats).toEqual({
      tests: null,
      coverage: null,
      adrs: null,
      loc: null,
      deps: null,
    });
  });
});
