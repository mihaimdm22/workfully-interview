import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { screen, screenStreaming } from "./screen";
import type { ScreeningResult } from "@/lib/domain/screening";

type DoGenerateResult = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

const VALID_OBJECT: ScreeningResult = {
  candidateName: "Jane Doe",
  role: "Senior Backend Engineer",
  verdict: "strong",
  score: 90,
  summary: "Senior backend engineer with strong stack alignment.",
  mustHaves: [
    {
      requirement: "4+ years backend experience",
      matched: true,
      evidence: "6 years at CloudPay and Recruto",
    },
    {
      requirement: "TypeScript + Node.js",
      matched: true,
    },
  ],
  niceToHaves: [
    {
      requirement: "NestJS specifically",
      matched: true,
      evidence: "NestJS payments API at CloudPay",
    },
  ],
  strengths: ["Mentoring track record", "PostgreSQL query optimization"],
  gaps: [],
  recommendation: "Move forward to technical interview.",
};

function fakeModel(payload: unknown) {
  const result: DoGenerateResult = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 50, text: 50, reasoning: 0 },
    },
    warnings: [],
  };
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doGenerate: async () => result,
  });
}

describe("screen", () => {
  it("returns a structured ScreeningResult on success", async () => {
    const out = await screen(
      {
        jobDescription: "Senior Backend Engineer…",
        cv: "Elena Kowalski 6 years…",
      },
      { model: fakeModel(VALID_OBJECT) },
    );
    expect(out.result).toEqual(VALID_OBJECT);
    expect(out.model).toBeTruthy();
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("throws on empty job description", async () => {
    await expect(
      screen(
        { jobDescription: "", cv: "cv" },
        { model: fakeModel(VALID_OBJECT) },
      ),
    ).rejects.toThrow(/job description/i);
  });

  it("throws on empty CV", async () => {
    await expect(
      screen(
        { jobDescription: "jd", cv: "   " },
        { model: fakeModel(VALID_OBJECT) },
      ),
    ).rejects.toThrow(/CV/i);
  });

  it("rejects payloads that violate the schema", async () => {
    const bad = { ...VALID_OBJECT, score: 150, verdict: "maybe" };
    await expect(
      screen({ jobDescription: "jd", cv: "cv" }, { model: fakeModel(bad) }),
    ).rejects.toThrow();
  });

  it("rounds fractional scores to the nearest integer", async () => {
    const fractional = { ...VALID_OBJECT, score: 87.6 };
    const out = await screen(
      { jobDescription: "jd", cv: "cv" },
      { model: fakeModel(fractional) },
    );
    // The schema no longer enforces integer-ness (Zod 4's `.int()` injects
    // bounds Anthropic rejects), so we round on the way out.
    expect(out.result.score).toBe(88);
  });

  it("forwards the abort signal to generateObject (W19')", async () => {
    // Capture the signal the AI SDK passes into the model so we can assert
    // it's the one we provided.
    let receivedSignal: AbortSignal | undefined;
    const model = new MockLanguageModelV3({
      provider: "mock",
      modelId: "mock-model",
      doGenerate: async ({ abortSignal }) => {
        receivedSignal = abortSignal;
        const result: DoGenerateResult = {
          content: [{ type: "text", text: JSON.stringify(VALID_OBJECT) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        };
        return result;
      },
    });

    const controller = new AbortController();
    await screen(
      { jobDescription: "jd", cv: "cv" },
      { model, signal: controller.signal },
    );
    expect(receivedSignal).toBe(controller.signal);
  });
});

describe("screenStreaming", () => {
  /**
   * Regression test for the prod incident on 2026-04-30 where every screening
   * surfaced as "AI took longer than 120 seconds" because OpenRouter returned
   * a 400 ("For 'integer' type, properties maximum, minimum are not
   * supported") and the AI SDK's default `streamObject` `onError` is
   * `console.error(error)` — the partialObjectStream skipped the error chunk,
   * the for-await loop ended silently, and `await object` hung forever until
   * the FSM `after` 120s timer fired.
   *
   * With the `onError` capture in place, screenStreaming must reject with the
   * actual provider error so the FSM `screen` actor's `onError` fires
   * immediately and the user sees the real cause.
   */
  it("rejects when the provider streams an error part instead of partials", async () => {
    const providerError = new Error(
      "[Anthropic] output_config.format.schema: For 'integer' type, properties maximum, minimum are not supported",
    );
    const model = new MockLanguageModelV3({
      provider: "mock",
      modelId: "mock-model",
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "error", error: providerError });
            controller.close();
          },
        }),
      }),
    });

    await expect(
      screenStreaming({ jobDescription: "jd", cv: "cv" }, { model }),
    ).rejects.toThrow(/minimum.*not supported/i);
  });
});
