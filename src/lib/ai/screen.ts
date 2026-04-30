import "server-only";
import { generateObject, streamObject, type LanguageModel } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import {
  screeningResultSchema,
  type ScreeningResult,
} from "@/lib/domain/screening";

/**
 * Screening service.
 *
 * Single responsibility: given a JD + CV, produce a structured `ScreeningResult`.
 * Uses Vercel AI SDK's `generateObject` so the LLM is forced to emit JSON that
 * matches our Zod schema. If the model can't satisfy the schema, the SDK retries
 * automatically; if it still fails, the call throws — the FSM moves to the error
 * branch and the user is told the model failed (we don't fabricate a result).
 *
 * Routed through OpenRouter so the same call works against any vendor: the
 * default targets Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`), but
 * `OPENROUTER_MODEL` can point at any OpenRouter-supported model id.
 *
 * Two entrypoints:
 *   - `screen()`        — atomic. Returns once the full ScreeningResult is ready.
 *                         Used by the FSM screening actor (the FSM only commits
 *                         on the final result).
 *   - `screenStreaming()` — calls onPartial for each partial as the model
 *                           streams. Resolves with the same final ScreeningResult.
 *                           Used by the SSE route handler so the client sees
 *                           the verdict pill commit early, then must-haves fill
 *                           in row by row.
 */

/**
 * Default model. Haiku 4.5 is ~3–5× faster than Sonnet on structured output
 * with negligible verdict-quality loss for our schema, so a fresh demo run
 * lands inside the FSM timeout reliably. The settings modal lets the user
 * pick anything else from the OpenRouter allowlist; `OPENROUTER_MODEL` env
 * still overrides everything for ops-driven swaps (ADR 0004).
 */
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const DEFAULT_MAX_RETRIES = 0;
const DEFAULT_TEMPERATURE = 0.2;

interface ScreenInput {
  jobDescription: string;
  cv: string;
}

export interface ScreenOutput {
  result: ScreeningResult;
  model: string;
  latencyMs: number;
}

interface ScreenDeps {
  model?: LanguageModel;
  modelId?: string;
  /**
   * Number of corrective retries the AI SDK performs when the model emits
   * an object that fails schema validation. Each retry costs a full
   * roundtrip. Defaults to 0 — schema misses are rare on capable models,
   * and retries can blow a tight FSM timeout budget.
   */
  maxRetries?: number;
  /** Sampling temperature 0..1. Defaults to 0.2 for verdict consistency. */
  temperature?: number;
  /**
   * Cancellation signal. The orchestrator passes the AbortSignal that
   * XState's `fromPromise` exposes to the invoked actor so that when the
   * FSM exits `evaluating` (e.g., the `after` timeout fires, or the user
   * navigates away), the in-flight `generateObject` call is cancelled
   * instead of running to completion against a discarded actor. See
   * ADR 0006.
   */
  signal?: AbortSignal;
}

interface StreamingDeps extends ScreenDeps {
  /**
   * Called for each partial result as the model streams. Caller is expected
   * to forward partials to the client via SSE. This is best-effort — partials
   * may be incomplete and may not include every field on every tick.
   */
  onPartial?: (partial: Partial<ScreeningResult>) => void;
}

const SYSTEM_PROMPT = `You are a senior technical recruiter at a B2B SaaS company.
Your job is to evaluate one candidate against one job description and produce a structured fit assessment.

Rules:
- Be concrete and evidence-driven. Quote or paraphrase the CV when claiming a match.
- "wrong_role" is reserved for CVs that are for an entirely different profession (e.g. a graphic designer applying for a backend engineer role). Use it sparingly.
- "strong" requires that all listed must-haves are matched.
- "moderate" means most must-haves match but at least one is missing or unclear.
- "weak" means several must-haves are missing.
- The score is a single integer 0-100. Calibrate: 85+ = strong, 60-84 = moderate, 30-59 = weak, <30 = wrong role.
- Do not invent requirements that aren't in the JD.
- Do not speculate beyond what's in the CV. If the CV doesn't mention something, it's not matched.
- The recommendation should be one sentence a recruiter could paste into Slack.`;

function buildPrompt({ jobDescription, cv }: ScreenInput): string {
  return [
    "## JOB DESCRIPTION",
    jobDescription.trim(),
    "",
    "## CANDIDATE CV",
    cv.trim(),
    "",
    "Produce a structured screening verdict. Cover every must-have and nice-to-have explicitly.",
  ].join("\n");
}

function validateInputs(input: ScreenInput) {
  if (!input.jobDescription.trim()) throw new Error("Job description is empty");
  if (!input.cv.trim()) throw new Error("CV is empty");
}

export async function screen(
  input: ScreenInput,
  deps: ScreenDeps = {},
): Promise<ScreenOutput> {
  validateInputs(input);

  const modelId = deps.modelId ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  // Test escape hatch — used by E2E so we don't burn API credits or depend on
  // network reachability in CI. Never set in production. See docs/adr/0005-testing.md.
  // Echoes the resolved modelId so the verdict UI reflects the user's
  // settings choice end-to-end (the alternative — hardcoding "fake/local" —
  // would mask wiring bugs the E2E is supposed to catch).
  if (process.env.WORKFULLY_FAKE_AI === "1" && !deps.model) {
    return fakeScreen(input, modelId);
  }

  const model = deps.model ?? openrouter(modelId);
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const temperature = deps.temperature ?? DEFAULT_TEMPERATURE;

  const startedAt = Date.now();
  const { object } = await generateObject({
    model,
    schema: screeningResultSchema,
    schemaName: "ScreeningResult",
    schemaDescription: "Structured candidate-vs-role fit assessment",
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    temperature,
    maxRetries,
    abortSignal: deps.signal,
  });
  const latencyMs = Date.now() - startedAt;

  return {
    result: postprocess(object),
    model: modelId,
    latencyMs,
  };
}

/**
 * Streaming sibling of `screen()`. Same final result, plus partials emitted
 * via `onPartial` as the model streams tokens.
 */
export async function screenStreaming(
  input: ScreenInput,
  deps: StreamingDeps = {},
): Promise<ScreenOutput> {
  validateInputs(input);

  const modelId = deps.modelId ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  // Fake AI: simulate streaming with timed partial emits so the demo
  // experience is identical even without burning API credits.
  if (process.env.WORKFULLY_FAKE_AI === "1" && !deps.model) {
    return fakeScreenStreaming(input, deps, modelId);
  }

  const model = deps.model ?? openrouter(modelId);
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const temperature = deps.temperature ?? DEFAULT_TEMPERATURE;

  // streamObject's default `onError` is `console.error(error)` — provider
  // errors (e.g. OpenRouter returning 400 because the upstream model rejected
  // the schema) are silently swallowed: `partialObjectStream` skips error
  // chunks and ends, and `object.promise` is never resolved or rejected, so
  // `await object` hangs forever. The orchestrator's only safety net is the
  // FSM's 120s `after` timer, which surfaces to the user as a misleading
  // "AI took longer than 120 seconds" message. Capture the error here and
  // throw it after the partial loop so the FSM `screen` actor sees a real
  // rejection and routes through `onError` → idle with the actual reason.
  let streamError: unknown;

  const startedAt = Date.now();
  const { partialObjectStream, object } = streamObject({
    model,
    schema: screeningResultSchema,
    schemaName: "ScreeningResult",
    schemaDescription: "Structured candidate-vs-role fit assessment",
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    temperature,
    maxRetries,
    abortSignal: deps.signal,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  for await (const partial of partialObjectStream) {
    deps.onPartial?.(partial as Partial<ScreeningResult>);
  }

  if (streamError !== undefined) {
    throw streamError instanceof Error
      ? streamError
      : new Error(String(streamError));
  }

  // `object` resolves with the final, schema-validated result OR throws if
  // the stream ended without a complete object. Either path fits the FSM's
  // existing happy/error contract — same behavior as the atomic `screen()`.
  const finalObject = await object;
  const latencyMs = Date.now() - startedAt;

  return {
    result: postprocess(finalObject),
    model: modelId,
    latencyMs,
  };
}

/**
 * Defensive normalization for the AI-produced result. The schema doesn't carry
 * a JSON-Schema `integer` keyword for `score` (see `screening.ts`), so we
 * round on the way out in case the model returns a fractional number — keeps
 * the UI from rendering "87.5" and downstream consumers from seeing decimals.
 */
function postprocess(result: ScreeningResult): ScreeningResult {
  return { ...result, score: Math.round(result.score) };
}

/**
 * Test markers — drop these into a CV string to force a specific verdict
 * from the fake AI. Stable contract: callers (E2E specs, unit tests) opt into
 * a verdict explicitly, so updating fixture content can never silently flip
 * the verdict and let CI pass on the wrong path.
 */
export const FAKE_VERDICT_MARKERS = {
  weak: "[TEST_VERDICT_WEAK]",
  wrongRole: "[TEST_VERDICT_WRONG_ROLE]",
} as const;

function buildFakeResult(input: ScreenInput): ScreeningResult {
  const isWrongRole = input.cv.includes(FAKE_VERDICT_MARKERS.wrongRole);
  const isWeak = !isWrongRole && input.cv.includes(FAKE_VERDICT_MARKERS.weak);
  const verdict = isWrongRole ? "wrong_role" : isWeak ? "weak" : "strong";
  const score = isWrongRole ? 8 : isWeak ? 38 : 90;
  return {
    candidateName: "Test Candidate",
    role: "Senior Backend Engineer",
    verdict,
    score,
    summary: `[FAKE] ${verdict} match. This response is generated by the test harness, not Claude.`,
    mustHaves: [
      {
        requirement: "4+ years backend experience",
        matched: !isWeak && !isWrongRole,
      },
      { requirement: "TypeScript + Node.js", matched: !isWrongRole },
    ],
    niceToHaves: [],
    strengths: isWrongRole ? [] : ["Concrete shipping experience"],
    gaps: isWrongRole
      ? ["Wrong profession"]
      : isWeak
        ? ["Years of experience"]
        : [],
    recommendation: isWrongRole
      ? "Reject — wrong role."
      : isWeak
        ? "Decline for senior role; consider for junior pool."
        : "Move forward to technical interview.",
  };
}

function fakeScreen(input: ScreenInput, modelId: string): ScreenOutput {
  return {
    model: modelId,
    latencyMs: 1,
    result: buildFakeResult(input),
  };
}

/**
 * Simulates progressive reveal so a human running the demo against
 * WORKFULLY_FAKE_AI=1 can SEE streaming behavior without paying for real AI.
 * Emits partials with cumulative shape — each tick adds the next field —
 * mirroring how `streamObject` reveals fields incrementally over real
 * network roundtrips.
 *
 * Total simulated latency is ~2.5s. Live runs against Claude take 6–12s; the
 * shape of the reveal is the same.
 */
async function fakeScreenStreaming(
  input: ScreenInput,
  deps: StreamingDeps,
  modelId: string,
): Promise<ScreenOutput> {
  const final = buildFakeResult(input);
  const onPartial = deps.onPartial;

  // Build the cumulative tick sequence. Each tick is a Partial<ScreeningResult>
  // that adds one more field to the previous one. The order mirrors how the
  // model commits fields during real streaming — verdict + score first, then
  // summary, then must-haves row by row, then nice-to-haves / strengths / gaps,
  // then recommendation.
  const ticks: Array<{ delayMs: number; patch: Partial<ScreeningResult> }> = [
    { delayMs: 200, patch: { candidateName: final.candidateName } },
    { delayMs: 200, patch: { role: final.role } },
    { delayMs: 200, patch: { verdict: final.verdict } },
    { delayMs: 200, patch: { score: final.score } },
    { delayMs: 350, patch: { summary: final.summary } },
    { delayMs: 250, patch: { mustHaves: final.mustHaves.slice(0, 1) } },
    { delayMs: 250, patch: { mustHaves: final.mustHaves } },
    { delayMs: 200, patch: { niceToHaves: final.niceToHaves } },
    { delayMs: 250, patch: { strengths: final.strengths } },
    { delayMs: 250, patch: { gaps: final.gaps } },
    { delayMs: 200, patch: { recommendation: final.recommendation } },
  ];

  const startedAt = Date.now();
  let cumulative: Partial<ScreeningResult> = {};
  for (const t of ticks) {
    if (deps.signal?.aborted) throw new Error("aborted");
    await new Promise((r) => setTimeout(r, t.delayMs));
    cumulative = { ...cumulative, ...t.patch };
    onPartial?.(cumulative);
  }
  const latencyMs = Date.now() - startedAt;

  return {
    model: modelId,
    latencyMs,
    result: final,
  };
}
