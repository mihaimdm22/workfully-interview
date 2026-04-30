import "server-only";
import {
  ALLOWED_MODEL_IDS,
  MODEL_ALLOWLIST,
  type ModelOption,
} from "@/lib/domain/settings";

/**
 * Settings-modal model picker source.
 *
 * Live-fetches OpenRouter's `/api/v1/models` and intersects the response with
 * our hand-curated `MODEL_ALLOWLIST`. The intersection is what the modal
 * shows — every option is guaranteed to be (a) something we trust for
 * structured output, and (b) something OpenRouter is currently serving.
 *
 * Three layers of safety:
 *   - 5s fetch timeout via AbortController
 *   - 1h in-process cache to avoid hammering OpenRouter on every modal open
 *   - Hardcoded fallback (the full allowlist) when the live fetch fails or
 *     returns an empty intersection
 *
 * The cache is module-scoped, which is fine on Vercel Fluid Compute: function
 * instances are reused across requests, and a cold start just refetches.
 * No cross-request leakage risk because the data is non-sensitive and global.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface CacheEntry {
  models: ModelOption[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

export type ListModelsSource = "live" | "cache" | "fallback";

interface ListModelsResult {
  models: ModelOption[];
  source: ListModelsSource;
}

interface OpenRouterModel {
  id: string;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Returns the allowlisted models currently served by OpenRouter, or the
 * hardcoded allowlist if the live fetch fails. Always resolves — never throws.
 */
export async function listModels(
  opts: { signal?: AbortSignal } = {},
): Promise<ListModelsResult> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { models: cache.models, source: "cache" };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { models: [...MODEL_ALLOWLIST], source: "fallback" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onParentAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onParentAbort);

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenRouter /models returned ${res.status}`);
    }
    const body = (await res.json()) as OpenRouterModelsResponse;
    const liveIds = new Set(body.data.map((m) => m.id));
    const intersected = MODEL_ALLOWLIST.filter((m) => liveIds.has(m.id));
    // Empty intersection = API contract change or partial outage. Don't show
    // an empty dropdown — fall back to the curated list.
    const models = intersected.length > 0 ? intersected : [...MODEL_ALLOWLIST];
    const source: ListModelsSource =
      intersected.length > 0 ? "live" : "fallback";
    if (source === "live") {
      cache = { models, fetchedAt: now };
    }
    return { models, source };
  } catch {
    return { models: [...MODEL_ALLOWLIST], source: "fallback" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Server-side guard for the model id submitted from the settings modal.
 * The Zod schema also checks this, but we validate at every boundary that
 * touches the AI stack — defense in depth, and a clear error if the
 * allowlist diverges from a stale client.
 */
export function isAllowlistedModel(id: string): boolean {
  return ALLOWED_MODEL_IDS.has(id);
}

/** Test helper — flushes the module-scoped cache so test cases are independent. */
export function __resetModelsCacheForTests(): void {
  cache = null;
}
