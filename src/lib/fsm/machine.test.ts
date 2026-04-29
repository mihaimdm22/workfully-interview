import { describe, it, expect } from "vitest";
import { createActor, fromPromise, waitFor } from "xstate";
import { botMachine } from "./machine";
import type { ScreeningResult } from "@/lib/domain/screening";

const FAKE_RESULT: ScreeningResult = {
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
  return createActor(machine, { input: { conversationId: "test-convo" } });
}

describe("botMachine", () => {
  it("starts in idle", () => {
    const actor = makeActor();
    actor.start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("idle → screening.awaitingJobDescription on START_SCREENING", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    expect(actor.getSnapshot().value).toEqual({
      screening: "awaitingJobDescription",
    });
  });

  it("idle → jobBuilder on START_JOB_BUILDER", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_JOB_BUILDER" });
    expect(actor.getSnapshot().value).toBe("jobBuilder");
  });

  it("progresses through awaitingJobDescription → awaitingCv when JD provided", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD content" });
    expect(actor.getSnapshot().value).toEqual({ screening: "awaitingCv" });
    expect(actor.getSnapshot().context.jobDescription).toBe("JD content");
  });

  it("rejects empty PROVIDE_TEXT (guard)", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "   " });
    expect(actor.getSnapshot().value).toEqual({
      screening: "awaitingJobDescription",
    });
  });

  it("full screening flow: JD → CV → evaluating → presentingResult", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD" });
    actor.send({ type: "PROVIDE_TEXT", text: "CV" });
    expect(actor.getSnapshot().value).toEqual({ screening: "evaluating" });
    const final = await waitFor(
      actor,
      (s) => s.matches({ screening: "presentingResult" }),
      {
        timeout: 1000,
      },
    );
    expect(final.context.result).toEqual(FAKE_RESULT);
  });

  it("returns to idle on /cancel from awaitingJobDescription", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "CANCEL" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.jobDescription).toBeUndefined();
  });

  it("returns to idle on /cancel from awaitingCv (clearing JD)", () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD" });
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

  it("handles screening actor failure: returns to idle with error captured", async () => {
    const actor = makeActor({
      screenImpl: async () => {
        throw new Error("OpenRouter 503");
      },
    });
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD" });
    actor.send({ type: "PROVIDE_TEXT", text: "CV" });
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
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD1" });
    actor.send({ type: "PROVIDE_TEXT", text: "CV1" });
    await waitFor(actor, (s) => s.matches({ screening: "presentingResult" }), {
      timeout: 1000,
    });
    actor.send({ type: "START_SCREENING" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ screening: "awaitingJobDescription" });
    expect(snap.context.result).toBeUndefined();
  });

  it("RESET from presentingResult goes back to idle and clears context", async () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: "START_SCREENING" });
    actor.send({ type: "PROVIDE_TEXT", text: "JD" });
    actor.send({ type: "PROVIDE_TEXT", text: "CV" });
    await waitFor(actor, (s) => s.matches({ screening: "presentingResult" }), {
      timeout: 1000,
    });
    actor.send({ type: "RESET" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.result).toBeUndefined();
  });

  it("persists and rehydrates a snapshot mid-flow", () => {
    const a = makeActor();
    a.start();
    a.send({ type: "START_SCREENING" });
    a.send({ type: "PROVIDE_TEXT", text: "JD-frozen" });
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
    expect(b.getSnapshot().value).toEqual({ screening: "awaitingCv" });
    expect(b.getSnapshot().context.jobDescription).toBe("JD-frozen");
  });
});
