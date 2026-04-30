import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  screen,
  screenStreaming,
  FAKE_VERDICT_MARKERS,
  type ScreenOutput,
} from "./screen";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Tests the WORKFULLY_FAKE_AI=1 branch of `screen()`. This is the same code
 * path Playwright uses, so it deserves a unit test — small, deterministic,
 * surfaces regressions in marker handling.
 */
describe("screen (fake AI branch)", () => {
  const original = process.env.WORKFULLY_FAKE_AI;

  beforeEach(() => {
    process.env.WORKFULLY_FAKE_AI = "1";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.WORKFULLY_FAKE_AI;
    else process.env.WORKFULLY_FAKE_AI = original;
  });

  it("returns strong verdict by default (no marker)", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer with TypeScript and Node.js",
      cv: "Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS",
    });
    expect(out.result.verdict).toBe("strong");
    expect(out.result.score).toBeGreaterThanOrEqual(85);
    // Fake mode echoes the resolved model id (default Haiku 4.5) so E2E
    // and unit assertions can prove the user-selected model flows through.
    expect(out.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("returns weak verdict when CV contains the weak marker", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer",
      cv: `Junior dev. ${FAKE_VERDICT_MARKERS.weak}`,
    });
    expect(out.result.verdict).toBe("weak");
    expect(out.result.score).toBeLessThan(50);
  });

  it("returns wrong_role when CV contains the wrong-role marker", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer",
      cv: `Senior UX Designer. ${FAKE_VERDICT_MARKERS.wrongRole}`,
    });
    expect(out.result.verdict).toBe("wrong_role");
    expect(out.result.score).toBeLessThan(20);
  });

  it("wrong-role marker takes precedence over weak marker", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer",
      cv: `${FAKE_VERDICT_MARKERS.weak} ${FAKE_VERDICT_MARKERS.wrongRole}`,
    });
    expect(out.result.verdict).toBe("wrong_role");
  });

  it("echoes the caller-supplied modelId in fake mode (settings flow-through)", async () => {
    const out = await screen(
      {
        jobDescription: "Senior Backend Engineer",
        cv: "Elena Kowalski, 6 years TypeScript",
      },
      { modelId: "openai/gpt-5" },
    );
    expect(out.model).toBe("openai/gpt-5");
  });
});

/**
 * Tests `screenStreaming()`'s fake-AI branch. The fake emits cumulative
 * partials at fixed delays, then resolves with the same shape as `screen()`.
 * The SSE route relies on each partial being a strictly-growing prefix of the
 * final result, so we verify both ordering and the final equality contract.
 */
describe("screenStreaming (fake AI branch)", () => {
  const original = process.env.WORKFULLY_FAKE_AI;

  beforeEach(() => {
    process.env.WORKFULLY_FAKE_AI = "1";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.WORKFULLY_FAKE_AI;
    else process.env.WORKFULLY_FAKE_AI = original;
  });

  it("emits cumulative partials and resolves with the final result", async () => {
    const partials: Partial<ScreeningResult>[] = [];
    const out: ScreenOutput = await screenStreaming(
      {
        jobDescription: "Senior Backend Engineer with TypeScript",
        cv: "Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS",
      },
      { onPartial: (p) => partials.push(p) },
    );

    // At least one partial per scheduled tick — the orchestration emits 11.
    expect(partials.length).toBeGreaterThanOrEqual(5);

    // Final partial should match the resolved result on the keys it covers.
    const last = partials[partials.length - 1]!;
    expect(last.verdict).toBe(out.result.verdict);
    expect(last.score).toBe(out.result.score);
    expect(last.recommendation).toBe(out.result.recommendation);

    // Each subsequent partial is a strict superset of the previous one
    // (cumulative reveal — the SSE consumer relies on this).
    for (let i = 1; i < partials.length; i++) {
      const prevKeys = Object.keys(partials[i - 1]!);
      const nextKeys = new Set(Object.keys(partials[i]!));
      for (const k of prevKeys) expect(nextKeys.has(k)).toBe(true);
    }

    expect(out.model).toBe("anthropic/claude-haiku-4.5");
    expect(out.result.verdict).toBe("strong");
  });

  it("aborts before resolving when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      screenStreaming(
        {
          jobDescription: "Senior Backend Engineer",
          cv: "Elena Kowalski",
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/i);
  });
});
