import { describe, it, expect } from "vitest";
import { pairScreeningsToMessages } from "./pair-screenings";
import type { Message, Screening } from "@/lib/db/schema";
import type { ScreeningResult } from "@/lib/domain/screening";

const t = (sec: number) => new Date(2026, 0, 1, 0, 0, sec);

function msg(
  id: string,
  role: Message["role"],
  sec: number,
): Pick<Message, "id" | "role" | "createdAt"> {
  return { id, role, createdAt: t(sec) };
}

function makeResult(score: number): ScreeningResult {
  return {
    verdict: "strong",
    score,
    summary: "stub",
    mustHaves: [],
    niceToHaves: [],
    strengths: [],
    gaps: [],
    recommendation: "interview",
  };
}

function scr(
  sec: number,
  score: number,
): Pick<Screening, "result" | "createdAt"> {
  return { result: makeResult(score), createdAt: t(sec) };
}

describe("pairScreeningsToMessages", () => {
  it("returns an empty map when there are no screenings", () => {
    const messages = [msg("a", "bot", 1), msg("b", "user", 2)];
    expect(pairScreeningsToMessages(messages, []).size).toBe(0);
  });

  it("pairs a screening with the next bot message after its createdAt", () => {
    // user JD → bot CV-prompt → user CV → screening row → bot announcement
    const messages = [
      msg("u1", "user", 1),
      msg("b1", "bot", 2),
      msg("u2", "user", 3),
      msg("b2", "bot", 5), // verdict announcement
    ];
    const screenings = [scr(4, 90)];
    const out = pairScreeningsToMessages(messages, screenings);
    expect(out.size).toBe(1);
    expect(out.get("b2")?.score).toBe(90);
    expect(out.has("b1")).toBe(false);
  });

  it("preserves cards across multiple screenings in one conversation", () => {
    // Two complete screening rounds; first verdict must survive into second.
    const messages = [
      msg("b1", "bot", 1),
      msg("u1", "user", 2),
      msg("b2", "bot", 3),
      msg("u2", "user", 4),
      msg("b-verdict-1", "bot", 6), // first announcement
      msg("u3", "user", 7), // /screen
      msg("b3", "bot", 8),
      msg("u4", "user", 9),
      msg("b4", "bot", 10),
      msg("u5", "user", 11),
      msg("b-verdict-2", "bot", 13), // second announcement
    ];
    const screenings = [scr(5, 90), scr(12, 38)];
    const out = pairScreeningsToMessages(messages, screenings);
    expect(out.size).toBe(2);
    expect(out.get("b-verdict-1")?.score).toBe(90);
    expect(out.get("b-verdict-2")?.score).toBe(38);
  });

  it("never pairs a screening with a user message", () => {
    const messages = [msg("u1", "user", 5), msg("b1", "bot", 6)];
    const screenings = [scr(4, 90)];
    const out = pairScreeningsToMessages(messages, screenings);
    expect(out.has("u1")).toBe(false);
    expect(out.get("b1")?.score).toBe(90);
  });

  it("pairs when the bot message and screening land at the exact same millisecond", () => {
    // Postgres stores microseconds; a JS Date round-trip rounds to the
    // millisecond, so a screening recorded ~700µs before its announcement
    // can collapse to an equal createdAt. The pairing must still attach.
    const sameMs = new Date(2026, 0, 1, 0, 0, 5);
    const messages = [
      {
        id: "u1",
        role: "user" as const,
        createdAt: new Date(2026, 0, 1, 0, 0, 4),
      },
      { id: "b-verdict", role: "bot" as const, createdAt: sameMs },
    ];
    const screenings = [{ result: makeResult(72), createdAt: sameMs }];
    const out = pairScreeningsToMessages(messages, screenings);
    expect(out.get("b-verdict")?.score).toBe(72);
  });

  it("ignores bot messages that predate every screening", () => {
    // Greeting bot message before any screening exists must stay bare.
    const messages = [msg("greet", "bot", 1), msg("verdict", "bot", 5)];
    const screenings = [scr(4, 90)];
    const out = pairScreeningsToMessages(messages, screenings);
    expect(out.has("greet")).toBe(false);
    expect(out.get("verdict")?.score).toBe(90);
  });
});
