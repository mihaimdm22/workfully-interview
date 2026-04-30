import { describe, it, expect, vi, afterEach } from "vitest";
import { createActor, fromPromise, waitFor } from "xstate";
import { botMachine, EVAL_TIMEOUT_MS } from "./machine";
import type { ScreeningResult } from "@/lib/domain/screening";

const FAKE_RESULT: ScreeningResult = {
  candidateName: "Jane Doe",
  role: "Senior Backend Engineer",
  verdict: "strong",
  score: 92,
  summary: "Strong fit for the role with most must-haves matched.",
  mustHaves: [
    {
      requirement: "4+ years backend",
      matched: true,
      evidence: "6 years at CloudPay",
    },
    { requirement: "TypeScript + Node.js", matched: true },
  ],
  niceToHaves: [],
  strengths: ["NestJS", "PostgreSQL"],
  gaps: [],
  recommendation: "Move forward to technical interview.",
};

function makeActor(opts?: {
  screenImpl?: (input: {
    jobDescription: string;
    cv: string;
  }) => Promise<ScreeningResult>;
  evalTimeoutMs?: number;
}) {
  const screenImpl = opts?.screenImpl ?? (async () => FAKE_RESULT);
  const machine = botMachine.provide({
    actors: {
      screen: fromPromise<
        ScreeningResult,
        { jobDescription: string; cv: string }
      >(async ({ input }) => screenImpl(input)),
    },
  });
  return createActor(machine, {
    input: {
      conversationId: "test-convo",
      ...(opts?.evalTimeoutMs !== undefined
        ? { evalTimeoutMs: opts.evalTimeoutMs }
        : {}),
    },
  });
}

describe("botMachine", () => {
  it("starts in idle", () => {
    const actor = makeActor();
    actor.start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("idle → screening.gathering on START_SCREENING", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    expect(actor.getSnapshot().value).toEqual({
      screening: "gathering",
    });
  });

  it("idle → jobBuilder on START_JOB_BUILDER", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_JOB_BUILDER" });
    expect(actor.getSnapshot().value).toBe("jobBuilder");
  });

  it("PROVIDE_JD from idle auto-starts screening with JD set", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD content" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "gathering" });
    expect(snap.context.jobDescription).toBe("JD content");
    expect(snap.context.cv).toBeUndefined();
  });

  it("PROVIDE_CV from idle auto-starts screening with CV set", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_CV", text: "CV content" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "gathering" });
    expect(snap.context.cv).toBe("CV content");
    expect(snap.context.jobDescription).toBeUndefined();
  });

  it("PROVIDE_TEXT from idle fills the JD slot first", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_TEXT", text: "ambiguous content" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "gathering" });
    expect(snap.context.jobDescription).toBe("ambiguous content");
    expect(snap.context.cv).toBeUndefined();
  });

  it("rejects empty PROVIDE_TEXT (guard) — stays in idle", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_TEXT", text: "   " });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("full screening flow (JD then CV): both → evaluating → presentingResult", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_JD", text: "JD" });
    expect(actor.getSnapshot().value).toEqual({ screening: "gathering" });
    expect(actor.getSnapshot().context.jobDescription).toBe("JD");

    actor.send({ type: "PROVIDE_CV", text: "CV" });
    // After both slots are filled, `always` advances to evaluating.
    expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });

    const final = await waitFor(
      actor,
      (s) => s.matches({ screening: "presentingResult" }),
      { timeout: 1000 },
    );
    expect(final.context.result).toEqual(FAKE_RESULT);
  });

  it("upload-first flow (CV then JD): both → evaluating → presentingResult", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_CV", text: "CV" });
    expect(actor.getSnapshot().value).toEqual({ screening: "gathering" });
    expect(actor.getSnapshot().context.cv).toBe("CV");

    actor.send({ type: "PROVIDE_JD", text: "JD" });
    expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });

    const final = await waitFor(
      actor,
      (s) => s.matches({ screening: "presentingResult" }),
      { timeout: 1000 },
    );
    expect(final.context.result).toEqual(FAKE_RESULT);
  });

  it("PROVIDE_TEXT in gathering fills missing slot then evaluates", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_CV", text: "CV first" });
    actor.send({ type: "PROVIDE_TEXT", text: "ambiguous JD" });
    // CV is set so PROVIDE_TEXT fills JD, then `always` runs evaluation.
    expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });
    expect(actor.getSnapshot().context.jobDescription).toBe("ambiguous JD");
    expect(actor.getSnapshot().context.cv).toBe("CV first");
  });

  it("returns to idle on /cancel from gathering", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "CANCEL" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.jobDescription).toBeUndefined();
  });

  it("returns to idle on /cancel from gathering after JD provided (clearing JD)", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD" });
    actor.send({ type: "CANCEL" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.jobDescription).toBeUndefined();
    expect(snap.context.cv).toBeUndefined();
  });

  it("returns to idle from jobBuilder on /cancel", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_JOB_BUILDER" });
    actor.send({ type: "CANCEL" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("/screen mid-gather is a no-op (preserves uploaded slots)", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_CV", text: "CV" });
    actor.send({ type: "START_SCREENING" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "gathering" });
    expect(snap.context.cv).toBe("CV");
  });

  it("handles screening actor failure: returns to idle with error captured", async () => {
    const actor = makeActor({
      screenImpl: async () => {
        throw new Error("OpenRouter 503");
      },
    });
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD" });
    actor.send({ type: "PROVIDE_CV", text: "CV" });
    const final = await waitFor(actor, (s) => s.value === "idle", {
      timeout: 1000,
    });
    expect(final.context.error).toBe("OpenRouter 503");
    expect(final.context.jobDescription).toBeUndefined();
    expect(final.context.cv).toBeUndefined();
  });

  it("allows starting a new screening from presentingResult", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD1" });
    actor.send({ type: "PROVIDE_CV", text: "CV1" });
    await waitFor(actor, (s) => s.matches({ screening: "presentingResult" }), {
      timeout: 1000,
    });
    actor.send({ type: "START_SCREENING" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "gathering" });
    expect(snap.context.result).toBeUndefined();
    expect(snap.context.jobDescription).toBeUndefined();
    expect(snap.context.cv).toBeUndefined();
  });

  it("returns to idle on /reset from gathering", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.jobDescription).toBeUndefined();
  });

  it("returns to idle on /reset from gathering after JD provided", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD" });
    actor.send({ type: "RESET" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.jobDescription).toBeUndefined();
    expect(snap.context.cv).toBeUndefined();
  });

  it("RESET from presentingResult goes back to idle and clears context", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "PROVIDE_JD", text: "JD" });
    actor.send({ type: "PROVIDE_CV", text: "CV" });
    await waitFor(actor, (s) => s.matches({ screening: "presentingResult" }), {
      timeout: 1000,
    });
    actor.send({ type: "RESET" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.result).toBeUndefined();
  });

  describe("evaluating timeout (FSM-owned via xstate `after`)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires `after` and lands in idle with the typed timeout error", async () => {
      vi.useFakeTimers();
      const actor = makeActor({
        screenImpl: () =>
          new Promise(() => {
            /* never resolves */
          }),
      });
      actor.start();
      actor.send({ type: "PROVIDE_JD", text: "JD" });
      actor.send({ type: "PROVIDE_CV", text: "CV" });
      expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });

      await vi.advanceTimersByTimeAsync(EVAL_TIMEOUT_MS + 1);

      const snap = actor.getSnapshot();
      expect(snap.value).toBe("idle");
      expect(snap.context.error).toMatch(/longer than 120 seconds/i);
      expect(snap.context.jobDescription).toBeUndefined();
      expect(snap.context.cv).toBeUndefined();
    });

    it("honors a per-actor `evalTimeoutMs` from input (settings modal value)", async () => {
      vi.useFakeTimers();
      const customTimeout = 15_000;
      const actor = makeActor({
        evalTimeoutMs: customTimeout,
        screenImpl: () =>
          new Promise(() => {
            /* never resolves */
          }),
      });
      actor.start();
      actor.send({ type: "PROVIDE_JD", text: "JD" });
      actor.send({ type: "PROVIDE_CV", text: "CV" });
      expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });

      // Just below the custom timeout — should still be evaluating.
      await vi.advanceTimersByTimeAsync(customTimeout - 1);
      expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });

      // Cross the threshold — error message reflects the custom budget,
      // not the default 60s.
      await vi.advanceTimersByTimeAsync(2);
      const snap = actor.getSnapshot();
      expect(snap.value).toBe("idle");
      expect(snap.context.error).toMatch(/longer than 15 seconds/i);
    });

    it("does NOT fire `after` if screen resolves first", async () => {
      vi.useFakeTimers();
      const actor = makeActor();
      actor.start();
      actor.send({ type: "PROVIDE_JD", text: "JD" });
      actor.send({ type: "PROVIDE_CV", text: "CV" });
      await vi.advanceTimersByTimeAsync(10);
      const snap = actor.getSnapshot();
      expect(snap.value).toEqual({ screening: "presentingResult" });
      expect(snap.context.error).toBeUndefined();
      expect(snap.context.result).toEqual(FAKE_RESULT);
    });
  });

  it("persists and rehydrates a snapshot mid-flow", () => {
    const a = makeActor();
    a.start();
    a.send({ type: "PROVIDE_JD", text: "JD-frozen" });
    const snapshot = a.getPersistedSnapshot();
    a.stop();

    // Hydrate a brand-new actor from the persisted snapshot.
    const b = createActor(
      botMachine.provide({
        actors: {
          screen: fromPromise<
            ScreeningResult,
            { jobDescription: string; cv: string }
          >(async () => FAKE_RESULT),
        },
      }),
      { input: { conversationId: "test-convo" }, snapshot },
    );
    b.start();
    expect(b.getSnapshot().value).toEqual({ screening: "gathering" });
    expect(b.getSnapshot().context.jobDescription).toBe("JD-frozen");
  });
});
