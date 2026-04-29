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
function getClient(): Sql {
  if (!globalThis.__workfullyPgClient) {
    globalThis.__workfullyPgClient = postgres(resolveDatabaseUrl(), {
      max: 10,
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
