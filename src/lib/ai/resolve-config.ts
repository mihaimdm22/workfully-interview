import "server-only";
import { getAppSettings } from "@/lib/db/repositories";
import { DEFAULT_SETTINGS, type AppSettingsValue } from "@/lib/domain/settings";

/**
 * Resolves the runtime AI config for one screening request.
 *
 * Precedence:
 *   1. `OPENROUTER_MODEL` env var (if set + non-empty) — honored for the
 *      model id only. Lets ops swap models in Vercel preview deploys without
 *      a DB write, preserving the contract from ADR 0004. Env-supplied
 *      models bypass the UI allowlist on purpose — operators are trusted.
 *   2. The singleton `app_settings` row — what the user picked in the modal.
 *   3. `DEFAULT_SETTINGS` — fallback if the DB read throws (e.g., DB is
 *      unreachable or the migration hasn't run). Keeps the app booting in
 *      degraded mode rather than crashing the request.
 *
 * Called once per screening: the orchestrator hands the result to the FSM
 * (which reads `timeoutMs`) and the screening actor (which reads model,
 * retries, temperature). Cheap — one row lookup on the singleton.
 */

export interface ResolvedScreenConfig {
  model: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  /** For diagnostics — which layer produced each value. */
  source: {
    model: "env" | "db" | "default";
    rest: "db" | "default";
  };
}

export async function resolveScreenConfig(): Promise<ResolvedScreenConfig> {
  let dbSettings: AppSettingsValue | null = null;
  try {
    dbSettings = await getAppSettings();
  } catch {
    dbSettings = null;
  }

  const envModel = process.env.OPENROUTER_MODEL?.trim();
  const modelFromEnv = envModel && envModel.length > 0 ? envModel : null;

  const base = dbSettings ?? DEFAULT_SETTINGS;
  const model = modelFromEnv ?? base.model;

  return {
    model,
    timeoutMs: base.timeoutMs,
    maxRetries: base.maxRetries,
    temperature: base.temperature,
    source: {
      model: modelFromEnv ? "env" : dbSettings ? "db" : "default",
      rest: dbSettings ? "db" : "default",
    },
  };
}
