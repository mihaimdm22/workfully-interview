import "server-only";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * Build-time stat readers. Each returns `number | null` so the banner can
 * render `—` for any value that fails to compute. Failures must never throw —
 * the page is always renderable.
 *
 * `injectedRoot` lets tests point at fixture directories without touching CWD.
 */
export async function countTests(injectedRoot = ROOT): Promise<number | null> {
  return safe(async () => {
    let count = 0;
    await walk(join(injectedRoot, "src"), (path) => {
      if (/\.(test|spec)\.[tj]sx?$/.test(path)) count += 1;
    });
    return count;
  });
}

export async function countAdrs(injectedRoot = ROOT): Promise<number | null> {
  return safe(async () => {
    const dir = join(injectedRoot, "docs", "adr");
    const entries = await readdir(dir);
    return entries.filter((f) => /^\d{4}-.+\.md$/.test(f)).length;
  });
}

export async function countLines(injectedRoot = ROOT): Promise<number | null> {
  return safe(async () => {
    let total = 0;
    await walk(join(injectedRoot, "src"), async (path) => {
      if (!/\.(ts|tsx)$/.test(path)) return;
      if (/\.(test|spec)\./.test(path)) return;
      const content = await readFile(path, "utf8");
      total += content.split("\n").length;
    });
    return total;
  });
}

export async function countDeps(injectedRoot = ROOT): Promise<number | null> {
  return safe(async () => {
    const pkgPath = join(injectedRoot, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    return Object.keys(pkg.dependencies ?? {}).length;
  });
}

export async function readCoverage(
  injectedRoot = ROOT,
): Promise<number | null> {
  return safe(async () => {
    const snapshotPath = join(
      injectedRoot,
      "src",
      "lib",
      "walkthrough",
      ".coverage-snapshot.json",
    );
    const raw = await readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(raw) as { statementsPct?: number };
    return typeof snapshot.statementsPct === "number"
      ? Math.round(snapshot.statementsPct)
      : null;
  });
}

interface WalkthroughStats {
  tests: number | null;
  coverage: number | null;
  adrs: number | null;
  loc: number | null;
  deps: number | null;
}

/** Single entry point — the page calls this once and renders all five values. */
export async function readAllStats(
  injectedRoot = ROOT,
): Promise<WalkthroughStats> {
  const [tests, coverage, adrs, loc, deps] = await Promise.all([
    countTests(injectedRoot),
    readCoverage(injectedRoot),
    countAdrs(injectedRoot),
    countLines(injectedRoot),
    countDeps(injectedRoot),
  ]);
  return { tests, coverage, adrs, loc, deps };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function walk(
  dir: string,
  visit: (path: string) => void | Promise<void>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) return;
        await walk(path, visit);
      } else if (entry.isFile()) {
        await visit(path);
      }
    }),
  );
}
