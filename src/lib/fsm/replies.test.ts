import { describe, it, expect } from "vitest";
import { promptForState } from "./replies";

describe("promptForState", () => {
  it("returns idle prompt for idle state", () => {
    const reply = promptForState("idle");
    expect(reply).toMatch(/screen/i);
    expect(reply).toMatch(/newjob/i);
  });

  it("returns JD prompt for screening.awaitingJobDescription", () => {
    const reply = promptForState({ screening: "awaitingJobDescription" });
    expect(reply).toMatch(/job description/i);
    expect(reply).toMatch(/cancel/i);
  });

  it("returns CV prompt for screening.awaitingCv", () => {
    const reply = promptForState({ screening: "awaitingCv" });
    expect(reply).toMatch(/CV/i);
  });

  it("returns evaluating prompt for screening.evaluating", () => {
    const reply = promptForState({ screening: "evaluating" });
    expect(reply).toMatch(/evaluating|reading|seconds/i);
  });

  it("returns mock notice for jobBuilder", () => {
    const reply = promptForState("jobBuilder");
    expect(reply).toMatch(/mocked|cancel/i);
  });
});
