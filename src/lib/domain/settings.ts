import { z } from "zod";

/**
 * Runtime AI knobs surfaced in the settings modal. Every consumer of the AI
 * stack reads these — `screen.ts` for model + retries + temperature, the FSM
 * for the evaluation timeout. The DB stores one singleton row; env vars
 * override the DB; hardcoded defaults below are the last-resort fallback.
 *
 * The bounds here are also the slider/input ranges in the UI — the domain
 * module is the single source of truth so the modal can't accept a value the
 * server would reject. ADR 0004 explains why provider routing goes through
 * OpenRouter; this file extends that with the user-facing model picker.
 */

export const SETTINGS_SINGLETON_ID = "singleton";

/** Hard cap on the FSM evaluation timeout. The streaming SSE route explicitly
 *  declares `export const maxDuration = 300` (see
 *  `src/app/api/screening/stream/route.ts`) — without it the Vercel function
 *  inherits the project default (observed at 60s on this deploy), which kills
 *  the SSE connection before the FSM's `after` transition can fire and leaks
 *  as a 504 instead of a clean error. 180s leaves 120s of headroom under the
 *  declared 300s function ceiling. */
export const TIMEOUT_MS_MIN = 30_000;
export const TIMEOUT_MS_MAX = 180_000;

/** OpenRouter retries each cost a full model roundtrip. Two retries on a slow
 *  model can blow a 60s budget on its own. Allow 0–3; default 0. */
export const MAX_RETRIES_MIN = 0;
export const MAX_RETRIES_MAX = 3;

/** generateObject accepts 0..1 inclusive. Lower = more deterministic. */
export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 1;

/**
 * Allowlist of OpenRouter model ids the UI is allowed to surface. Two jobs:
 * (1) filter the live `/api/v1/models` response so we never offer a model
 * that lacks reliable structured-output support, and (2) act as a fallback
 * list if the live fetch fails. Curated by hand — adding a model means
 * verifying it returns valid JSON for our `screeningResultSchema`.
 */
export interface ModelOption {
  id: string;
  label: string;
  vendor: "anthropic" | "openai" | "google" | "meta";
  /** Short hint shown next to the label. Kept under ~30 chars. */
  hint: string;
}

export const MODEL_ALLOWLIST: readonly ModelOption[] = [
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    vendor: "anthropic",
    hint: "Fast, cheap, default",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    vendor: "anthropic",
    hint: "Best reasoning, slower",
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    vendor: "anthropic",
    hint: "Top tier, expensive",
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    vendor: "openai",
    hint: "OpenAI flagship",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 mini",
    vendor: "openai",
    hint: "Faster GPT",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vendor: "google",
    hint: "Google flagship",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    vendor: "google",
    hint: "Fast Google",
  },
  {
    id: "meta-llama/llama-4-maverick",
    label: "Llama 4 Maverick",
    vendor: "meta",
    hint: "Open weights",
  },
] as const;

export const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(
  MODEL_ALLOWLIST.map((m) => m.id),
);

/** Settings as persisted in Postgres. The shape mirrors the `appSettings`
 *  Drizzle row minus `id` and `updatedAt`. */
export const appSettingsSchema = z.object({
  model: z
    .string()
    .min(1)
    .max(128)
    .refine((id) => ALLOWED_MODEL_IDS.has(id), {
      message: "Model is not in the server-side allowlist",
    }),
  timeoutMs: z.number().int().min(TIMEOUT_MS_MIN).max(TIMEOUT_MS_MAX),
  maxRetries: z.number().int().min(MAX_RETRIES_MIN).max(MAX_RETRIES_MAX),
  temperature: z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX),
});

export type AppSettingsValue = z.infer<typeof appSettingsSchema>;

/** Hardcoded default — used when both env vars and DB are silent. Values
 *  match the migration seed so a fresh DB and a missing-row fallback agree.
 *  Timeout is 120s rather than 60s because Vercel cold starts + OpenRouter
 *  routing + structured-object streaming were producing genuine evaluations
 *  that landed at 60–90s and tripped the timeout. 120s is still well under
 *  the 180s slider max and the 300s Vercel function ceiling. */
export const DEFAULT_SETTINGS: AppSettingsValue = {
  model: "anthropic/claude-haiku-4.5",
  timeoutMs: 120_000,
  maxRetries: 0,
  temperature: 0.2,
};
