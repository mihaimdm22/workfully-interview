import "server-only";
import { generateObject, type LanguageModel } from "ai";
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
 */

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";

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
   * Cancellation signal. The orchestrator passes the AbortSignal that
   * XState's `fromPromise` exposes to the invoked actor so that when the
   * FSM exits `evaluating` (e.g., the `after` timeout fires, or the user
   * navigates away), the in-flight `generateObject` call is cancelled
   * instead of running to completion against a discarded actor. See
   * ADR 0006.
   */
  signal?: AbortSignal;
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

export async function screen(
  input: ScreenInput,
  deps: ScreenDeps = {},
): Promise<ScreenOutput> {
  if (!input.jobDescription.trim()) throw new Error("Job description is empty");
  if (!input.cv.trim()) throw new Error("CV is empty");

  // Test escape hatch — used by E2E so we don't burn API credits or depend on
  // network reachability in CI. Never set in production. See docs/adr/0005-testing.md.
  if (process.env.WORKFULLY_FAKE_AI === "1" && !deps.model) {
    return fakeScreen(input);
  }

  const modelId = deps.modelId ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const model = deps.model ?? openrouter(modelId);

  const startedAt = Date.now();
  const { object } = await generateObject({
    model,
    schema: screeningResultSchema,
    schemaName: "ScreeningResult",
    schemaDescription: "Structured candidate-vs-role fit assessment",
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    temperature: 0.2,
    maxRetries: 2,
    abortSignal: deps.signal,
  });
  const latencyMs = Date.now() - startedAt;

  return {
    result: object,
    model: modelId,
    latencyMs,
  };
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

function fakeScreen(input: ScreenInput): ScreenOutput {
  // Explicit markers > heuristics. Default is `strong` so the happy path
  // requires no marker.
  const isWrongRole = input.cv.includes(FAKE_VERDICT_MARKERS.wrongRole);
  const isWeak = !isWrongRole && input.cv.includes(FAKE_VERDICT_MARKERS.weak);
  const verdict = isWrongRole ? "wrong_role" : isWeak ? "weak" : "strong";
  const score = isWrongRole ? 8 : isWeak ? 38 : 90;
  return {
    model: "fake/local",
    latencyMs: 1,
    result: {
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
    },
  };
}
