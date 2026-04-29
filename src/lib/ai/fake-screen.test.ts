import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, FAKE_VERDICT_MARKERS } from "./screen";

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
    expect(out.model).toBe("fake/local");
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
});
