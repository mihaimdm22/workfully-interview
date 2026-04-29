import "server-only";

/**
 * Tiny request-scoped structured logger.
 *
 * Every line is a single JSON object so production logs are grep-friendly
 * and Vercel's log aggregator (or anything ingesting structured stdout)
 * can index them. The `conv` field is bound at logger creation; callers
 * just pass the rest.
 *
 * Silent in vitest so the unit suite isn't drowned in noise. Detected via
 * `process.env.VITEST` (vitest sets this) with `NODE_ENV === "test"` as
 * a belt-and-suspenders fallback.
 */

export interface LogFields {
  event: string;
  from?: string;
  to?: string;
  ms?: number;
  ok?: boolean;
  err?: string;
  [k: string]: unknown;
}

export interface Logger {
  info(fields: LogFields): void;
  error(fields: LogFields): void;
}

const isTestEnv =
  process.env.VITEST === "true" || process.env.NODE_ENV === "test";

const noop: Logger = {
  info: () => undefined,
  error: () => undefined,
};

export function createLogger(conversationId: string): Logger {
  if (isTestEnv) return noop;
  const base = { conv: conversationId };
  return {
    info(fields) {
      console.info(JSON.stringify({ ...base, ...fields }));
    },
    error(fields) {
      console.error(JSON.stringify({ ...base, ...fields }));
    },
  };
}

/**
 * Render an FSM state value as a stable string for log fields.
 *   "idle"               → "idle"
 *   { screening: "x" }   → "screening.x"
 */
export function stateString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 1) {
      const entry = entries[0];
      if (entry) {
        const [k, v] = entry;
        return `${k}.${stateString(v)}`;
      }
    }
  }
  return String(value);
}
