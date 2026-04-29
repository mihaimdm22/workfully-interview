import { describe, it, expect } from "vitest";
import { classifyIntent } from "./intent";

describe("classifyIntent", () => {
  describe("startScreening", () => {
    it.each([
      "/screen",
      "/screen ",
      "screen a candidate",
      "I want to screen a candidate",
      "screen candidate",
      "evaluate a candidate",
      "evaluate candidate",
      "screen",
    ])('matches "%s"', (input) => {
      expect(classifyIntent(input)).toEqual({ kind: "startScreening" });
    });
  });

  describe("startJobBuilder", () => {
    it.each([
      "/newjob",
      "create a job description",
      "create a job",
      "build a JD",
      "build a job",
      "new job",
    ])('matches "%s"', (input) => {
      expect(classifyIntent(input)).toEqual({ kind: "startJobBuilder" });
    });
  });

  describe("cancel", () => {
    it.each(["/cancel", "cancel", "CANCEL", "stop", "abort"])(
      'matches "%s"',
      (input) => {
        expect(classifyIntent(input)).toEqual({ kind: "cancel" });
      },
    );
  });

  describe("reset", () => {
    it.each(["/reset", "/done", "start over"])('matches "%s"', (input) => {
      expect(classifyIntent(input)).toEqual({ kind: "reset" });
    });
  });

  describe("content", () => {
    it("returns trimmed text for free-form messages", () => {
      expect(classifyIntent("  hello world  ")).toEqual({
        kind: "content",
        text: "hello world",
      });
    });

    it("returns empty content for whitespace-only input", () => {
      expect(classifyIntent("   \n\t")).toEqual({ kind: "content", text: "" });
    });

    it("treats long pasted content as content (not a command)", () => {
      const jd = `Senior Backend Engineer role with Node.js and PostgreSQL...`;
      expect(classifyIntent(jd)).toEqual({ kind: "content", text: jd });
    });

    it('does not match "screen" if it appears mid-sentence as a noun', () => {
      // "screen the candidate" matches, but "look at the screen" does not.
      const result = classifyIntent("look at the screen size");
      expect(result.kind).toBe("content");
    });
  });
});
