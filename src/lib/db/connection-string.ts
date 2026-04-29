/**
 * Resolve the Postgres connection string from a fallback chain so the same
 * code works under three setups without per-environment config:
 *
 *   1. `DATABASE_URL` — local `.env` and any explicitly-set environment.
 *   2. `STORAGE_DATABASE_URL` — Vercel marketplace integrations (Neon, Supabase,
 *      Postgres) default to the `STORAGE_` prefix when installed via the
 *      Storage tab, and write the pooled URL into `STORAGE_DATABASE_URL`.
 *   3. `POSTGRES_URL` — legacy Vercel Postgres convention, kept as a last
 *      resort so a project migrated from the old integration still boots.
 */
export function resolveDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.STORAGE_DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No database URL set. Looked for DATABASE_URL, STORAGE_DATABASE_URL, POSTGRES_URL.",
    );
  }
  return url;
}
