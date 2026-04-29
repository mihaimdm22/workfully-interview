import { describe, it, expect } from "vitest";
import { createActor, fromPromise } from "xstate";
import { botMachine } from "./machine";
import { isPersistedSnapshot } from "./snapshot";
import type { ScreeningResult } from "@/lib/domain/screening";

describe("isPersistedSnapshot", () => {
  it("accepts a valid active snapshot", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: "idle",
        context: { conversationId: "abc" },
      }),
    ).toBe(true);
  });

  it("accepts done / error / stopped statuses", () => {
    for (const status of ["done", "error", "stopped"] as const) {
      expect(
        isPersistedSnapshot({
          status,
          value: "idle",
          context: { conversationId: "abc" },
        }),
      ).toBe(true);
    }
  });

  it("accepts every legal screening substate", () => {
    for (const sub of [
      "gathering",
      "evaluating",
      "presentingResult",
    ] as const) {
      expect(
        isPersistedSnapshot({
          status: "active",
          value: { screening: sub },
          context: { conversationId: "abc" },
        }),
      ).toBe(true);
    }
  });

  it("accepts legacy substate names so pre-migration snapshots rehydrate", () => {
    for (const sub of ["awaitingJobDescription", "awaitingCv"] as const) {
      expect(
        isPersistedSnapshot({
          status: "active",
          value: { screening: sub },
          context: { conversationId: "abc" },
        }),
      ).toBe(true);
    }
  });

  it("accepts jobBuilder", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: "jobBuilder",
        context: { conversationId: "abc" },
      }),
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      isPersistedSnapshot({
        status: "running",
        value: "idle",
        context: { conversationId: "abc" },
      }),
    ).toBe(false);
  });

  it("rejects an unknown top-level state name", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: "completely-fake-state",
        context: { conversationId: "abc" },
      }),
    ).toBe(false);
  });

  it("rejects an unknown screening substate", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: { screening: "fictional" },
        context: { conversationId: "abc" },
      }),
    ).toBe(false);
  });

  it("rejects context without a conversationId", () => {
    expect(
      isPersistedSnapshot({
        status: "active",
        value: "idle",
        context: {},
      }),
    ).toBe(false);
  });

  it("rejects null / undefined / strings", () => {
    expect(isPersistedSnapshot(null)).toBe(false);
    expect(isPersistedSnapshot(undefined)).toBe(false);
    expect(isPersistedSnapshot("active")).toBe(false);
  });

  it("rejects objects without a recognised status", () => {
    expect(
      isPersistedSnapshot({
        value: "idle",
        context: { conversationId: "abc" },
      }),
    ).toBe(false);
    expect(isPersistedSnapshot({ status: "running" })).toBe(false);
  });

  it("round-trips a real getPersistedSnapshot() output (regression)", () => {
    // Tightening the schema must not reject valid XState payloads. Build a
    // real persisted snapshot from the actual machine in every state we
    // reach in production and assert each survives validation.
    const machine = botMachine.provide({
      actors: {
        screen: fromPromise<
          ScreeningResult,
          { jobDescription: string; cv: string }
        >(
          () =>
            new Promise(() => {
              /* never resolves */
            }),
        ),
      },
    });
    const a = createActor(machine, { input: { conversationId: "abc" } });
    a.start();
    expect(isPersistedSnapshot(a.getPersistedSnapshot())).toBe(true);
    a.send({ type: "START_SCREENING" });
    expect(isPersistedSnapshot(a.getPersistedSnapshot())).toBe(true);
    a.send({ type: "PROVIDE_TEXT", text: "JD" });
    expect(isPersistedSnapshot(a.getPersistedSnapshot())).toBe(true);
    a.send({ type: "PROVIDE_TEXT", text: "CV" });
    // Now in evaluating.
    expect(isPersistedSnapshot(a.getPersistedSnapshot())).toBe(true);
    a.stop();
  });
});
