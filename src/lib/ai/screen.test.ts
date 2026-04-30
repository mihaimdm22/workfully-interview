import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { screen } from "./screen";
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
