import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "./screen";

/**
 * Tests the WORKFULLY_FAKE_AI=1 branch of `screen()`. This is the same code
 * path Playwright uses, so it deserves a unit test — small, deterministic,
 * surfaces regressions in fixture mappings.
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

  it("returns strong verdict for senior-shaped CV text", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer with TypeScript and Node.js",
      cv: "Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS",
    });
    expect(out.result.verdict).toBe("strong");
    expect(out.result.score).toBeGreaterThanOrEqual(85);
    expect(out.model).toBe("fake/local");
  });

  it("returns weak verdict for junior CV signals", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer",
      cv: "Junior dev, 1.5 years experience, bootcamp grad",
    });
    expect(out.result.verdict).toBe("weak");
    expect(out.result.score).toBeLessThan(50);
  });

  it("returns wrong_role for designer CV", async () => {
    const out = await screen({
      jobDescription: "Senior Backend Engineer",
      cv: "Senior UX Designer, Figma, graphic design",
    });
    expect(out.result.verdict).toBe("wrong_role");
    expect(out.result.score).toBeLessThan(20);
  });
});
