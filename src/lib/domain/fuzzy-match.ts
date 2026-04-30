/**
 * Hand-rolled fuzzy match scorer for the Cmd-K palette.
 *
 * Avoids `fuse.js` (~9KB) — at the volume of screenings this app handles
 * (≤50 typical), a 30-line scorer is faster to read, faster to ship, and has
 * exactly the ranking we want:
 *
 *   exact prefix match on name        = 100
 *   contiguous substring in name      = 80
 *   word-boundary match in role/sum   = 60
 *   substring anywhere                = 30
 *   below threshold                   = 0 (filtered out)
 *
 * Calibration is tuned for "linus" matching "Linus Torvalds" higher than
 * "Lin Manuel" (substring win) and "Tim Berners-Lee" (no match).
 */

interface FuzzyTarget {
  /** Matched against with the highest weight. */
  primary: string;
  /** Matched against secondarily — role title, summary, etc. */
  secondary?: string;
}

export function scoreMatch(query: string, target: FuzzyTarget): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const primary = target.primary.toLowerCase();
  const secondary = (target.secondary ?? "").toLowerCase();

  // Exact prefix
  if (primary.startsWith(q)) return 100;
  // Word-boundary prefix in primary (e.g. "torv" matches "Linus Torvalds")
  for (const word of primary.split(/\s+/)) {
    if (word.startsWith(q)) return 90;
  }
  // Contiguous substring in primary
  if (primary.includes(q)) return 80;
  // Word-boundary in secondary
  for (const word of secondary.split(/\s+/)) {
    if (word.startsWith(q)) return 60;
  }
  // Anywhere in secondary
  if (secondary.includes(q)) return 30;

  return 0;
}

interface RankedMatch<T> {
  item: T;
  score: number;
}

export function rankMatches<T>(
  query: string,
  items: T[],
  toTarget: (item: T) => FuzzyTarget,
  threshold = 30,
): RankedMatch<T>[] {
  return items
    .map((item) => ({ item, score: scoreMatch(query, toTarget(item)) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
