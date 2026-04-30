import { describe, expect, it } from "vitest";
import { rankMatches, scoreMatch } from "./fuzzy-match";

describe("scoreMatch", () => {
  it("scores exact prefix highest", () => {
    expect(
      scoreMatch("linus", { primary: "Linus Torvalds" }),
    ).toBeGreaterThanOrEqual(100);
  });

  it("scores word-boundary higher than substring", () => {
    const wb = scoreMatch("torv", { primary: "Linus Torvalds" });
    const sub = scoreMatch("inus", { primary: "Linus Torvalds" });
    expect(wb).toBeGreaterThan(sub);
  });

  it("falls back to secondary fields", () => {
    const s = scoreMatch("backend", {
      primary: "Linus Torvalds",
      secondary: "Senior Backend Engineer",
    });
    expect(s).toBeGreaterThanOrEqual(60);
  });

  it("returns 0 for no match", () => {
    expect(scoreMatch("xyz", { primary: "Linus Torvalds" })).toBe(0);
  });

  it("ignores empty query", () => {
    expect(scoreMatch("", { primary: "Linus Torvalds" })).toBe(0);
  });
});

describe("rankMatches", () => {
  const items = [
    { id: "1", name: "Linus Torvalds", role: "Staff Platform Engineer" },
    { id: "2", name: "Tim Berners-Lee", role: "Frontend Engineer" },
    { id: "3", name: "Ada Lovelace", role: "Senior Backend Engineer" },
  ];

  it("ranks by score, primary > secondary", () => {
    const out = rankMatches("backend", items, (i) => ({
      primary: i.name,
      secondary: i.role,
    }));
    expect(out).toHaveLength(1);
    expect(out[0]!.item.id).toBe("3");
  });

  it("filters below threshold", () => {
    const out = rankMatches("xyz", items, (i) => ({ primary: i.name }));
    expect(out).toHaveLength(0);
  });

  it("orders multiple matches by score desc", () => {
    const out = rankMatches("e", items, (i) => ({
      primary: i.name,
      secondary: i.role,
    }));
    // Several items contain "e" — assert sorted desc.
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
    }
  });
});
