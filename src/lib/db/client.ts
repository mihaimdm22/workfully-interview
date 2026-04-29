import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { resolveDatabaseUrl } from "./connection-string";
import * as schema from "./schema";

declare global {
  var __workfullyPgClient: Sql | undefined;
  var __workfullyDb: PostgresJsDatabase<typeof schema> | undefined;
}

/**
 * Lazy singleton.
 *
 * The client and Drizzle wrapper are created on first call so that:
 *   - `next build` doesn't crash when no database URL is set (server components
 *     using `force-dynamic` never evaluate at build time, but importing this
 *     module would still trigger the check if it ran at module-init).
 *   - HMR in dev reuses the same connection pool across rebuilds via globalThis.
 */
function resolvePoolMax(): number {
  const explicit = process.env.MAX_DB_CONNECTIONS;
  if (explicit) {
    const n = Number.parseInt(explicit, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        `MAX_DB_CONNECTIONS must be a positive integer, got: ${explicit}`,
      );
    }
    return n;
  }
  // On Vercel Fluid Compute each instance is a single-process function, so
  // a pool larger than 1 only adds queueing on top of Postgres's own
  // connection cap. Local Docker / long-lived servers benefit from a larger
  // pool because they fan out across many concurrent requests.
  return process.env.VERCEL ? 1 : 10;
}

function getClient(): Sql {
  if (!globalThis.__workfullyPgClient) {
    globalThis.__workfullyPgClient = postgres(resolveDatabaseUrl(), {
      max: resolvePoolMax(),
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalThis.__workfullyPgClient;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalThis.__workfullyDb) {
    globalThis.__workfullyDb = drizzle(getClient(), { schema });
  }
  return globalThis.__workfullyDb;
}
