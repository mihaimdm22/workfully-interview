import { describe, it, expect } from "vitest";
import { stateString } from "./log";

describe("stateString", () => {
  it("returns simple string values verbatim", () => {
    expect(stateString("idle")).toBe("idle");
    expect(stateString("jobBuilder")).toBe("jobBuilder");
  });

  it("flattens single-key objects with dot notation", () => {
    expect(stateString({ screening: "evaluating" })).toBe(
      "screening.evaluating",
    );
    expect(stateString({ screening: "awaitingJobDescription" })).toBe(
      "screening.awaitingJobDescription",
    );
  });

  it("falls back to String() for shapes it doesn't model", () => {
    // Multi-key objects fall through to a deterministic string. This path
    // doesn't exist in the bot FSM today but the helper shouldn't crash.
    expect(stateString(null)).toBe("null");
    expect(stateString(42)).toBe("42");
  });
});
