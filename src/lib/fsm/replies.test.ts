import { describe, it, expect } from "vitest";
import { promptForState } from "./replies";

describe("promptForState", () => {
  it("returns idle prompt for idle state", () => {
    const reply = promptForState("idle");
    expect(reply).toMatch(/screen/i);
    expect(reply).toMatch(/newjob/i);
  });

  it("gathering with nothing provided invites either JD or CV", () => {
    const reply = promptForState(
      { screening: "gathering" },
      {
        conversationId: "c",
      },
    );
    expect(reply).toMatch(/job description/i);
    expect(reply).toMatch(/CV/);
    expect(reply).toMatch(/any order/i);
  });

  it("gathering with JD already provided asks for CV", () => {
    const reply = promptForState(
      { screening: "gathering" },
      { conversationId: "c", jobDescription: "JD" },
    );
    expect(reply).toMatch(/got the/i);
    expect(reply).toMatch(/CV/);
  });

  it("gathering with CV already provided asks for JD", () => {
    const reply = promptForState(
      { screening: "gathering" },
      { conversationId: "c", cv: "CV" },
    );
    expect(reply).toMatch(/got the/i);
    expect(reply).toMatch(/job description/i);
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
