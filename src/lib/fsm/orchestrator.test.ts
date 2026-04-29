import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor, fromPromise, type AnyActorRef } from "xstate";
import { botMachine } from "./machine";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Orchestrator integration tests.
 *
 * Two layers covered here:
 *   1. The W1 regression: a thrown `waitFor` (timeout, etc.) must not leak
 *      the actor — the try/finally is asserted by spying on actor.stop.
 *   2. The full orchestration path (W9): startConversation, successful
 *      screening, AI failure, all running against mocked repository and AI
 *      modules so the orchestrator exercises real XState + replies + log.
 *
 * Stub at the repository boundary, not Drizzle — the surface is small and
 * the test stays fast (no Postgres, no network).
 */

const stopCalls: AnyActorRef[] = [];

vi.mock("xstate", async () => {
  const actual = await vi.importActual<typeof import("xstate")>("xstate");
  return {
    ...actual,
    waitFor: vi.fn(actual.waitFor),
    createActor: ((...args: Parameters<typeof actual.createActor>) => {
      const actor = actual.createActor(...args);
      const originalStop = actor.stop.bind(actor);
      // Object.defineProperty so we can wrap a method that's typed as readonly.
      Object.defineProperty(actor, "stop", {
        value: () => {
          stopCalls.push(actor);
          return originalStop();
        },
        configurable: true,
      });
      return actor;
    }) as typeof actual.createActor,
  };
});

const repos = {
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  updateConversationSnapshotIfVersion: vi.fn(),
  appendMessage: vi.fn(),
  recordScreening: vi.fn(),
  ConcurrentModificationError: class extends Error {
    readonly conversationId: string;
    readonly expectedVersion: number;
    constructor(conversationId: string, expectedVersion: number) {
      super(
        `Conversation ${conversationId} was modified concurrently (expected version ${expectedVersion})`,
      );
      this.name = "ConcurrentModificationError";
      this.conversationId = conversationId;
      this.expectedVersion = expectedVersion;
    }
  },
};

vi.mock("@/lib/db/repositories", () => repos);

vi.mock("@/lib/ai/screen", () => ({
  screen: vi.fn(),
}));

function buildSnapshot(
  build: (a: ReturnType<typeof createActor>) => void,
): unknown {
  const a = createActor(
    botMachine.provide({
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
    }),
    { input: { conversationId: "test-convo" } },
  );
  a.start();
  build(a);
  const snap = a.getPersistedSnapshot();
  a.stop();
  return snap;
}

/**
 * Build a snapshot already in `screening.evaluating` state. From there,
 * `dispatch` will hit `waitFor` and we can simulate the timeout-leak path.
 */
function makeEvaluatingSnapshot(): unknown {
  return buildSnapshot((a) => {
    a.send({ type: "PROVIDE_JD", text: "JD" });
    a.send({ type: "PROVIDE_CV", text: "CV" });
  });
}

/**
 * Snapshot in `screening.gathering` with the JD already filled — dispatch's
 * subsequent CV event triggers the `always` transition into `evaluating`.
 */
function makeGatheringWithJdSnapshot(): unknown {
  return buildSnapshot((a) => {
    a.send({ type: "PROVIDE_JD", text: "Senior Backend Engineer" });
  });
}

const FAKE_RESULT: ScreeningResult = {
  candidateName: "Jane Doe",
  role: "Senior Backend Engineer",
  verdict: "strong",
  score: 90,
  summary: "Strong fit.",
  mustHaves: [{ requirement: "TS + Node", matched: true }],
  niceToHaves: [],
  strengths: ["NestJS"],
  gaps: [],
  recommendation: "Move forward.",
};

beforeEach(() => {
  vi.clearAllMocks();
  stopCalls.length = 0;
  repos.appendMessage.mockResolvedValue({
    id: "msg-1",
    conversationId: "test-convo",
    role: "user",
    content: "hi",
    attachmentName: null,
    attachmentBytes: null,
    createdAt: new Date(),
  });
  // Default: CAS succeeds and returns a bumped version. Individual tests
  // override to throw ConcurrentModificationError when exercising the race.
  repos.updateConversationSnapshotIfVersion.mockResolvedValue(1);
});

describe("dispatch — actor lifecycle on error paths (W1)", () => {
  it("stops the actor when waitFor rejects (timeout leak path)", async () => {
    // Hydrate from an evaluating snapshot so dispatch enters waitFor.
    repos.getConversation.mockResolvedValue({
      id: "test-convo",
      fsmSnapshot: makeEvaluatingSnapshot(),
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Make waitFor reject immediately — simulates the EVAL_TIMEOUT path
    // without burning 60s.
    const { waitFor } = await import("xstate");
    vi.mocked(waitFor).mockRejectedValueOnce(new Error("timeout"));

    const stopCallsBefore = stopCalls.length;

    const { dispatch } = await import("./orchestrator");

    // PROVIDE_TEXT here is a no-op (machine is already in evaluating, no
    // matching transition) — we just need any event so dispatch runs through
    // waitFor.
    await expect(
      dispatch({
        conversationId: "test-convo",
        event: { type: "PROVIDE_TEXT", text: "trigger" },
        userMessage: "trigger",
      }),
    ).rejects.toThrow("timeout");

    // The actor created inside dispatch must have been stopped despite the
    // throw — that's the W1 guarantee.
    const newStops = stopCalls.length - stopCallsBefore;
    expect(newStops).toBeGreaterThanOrEqual(1);
  });
});

describe("startConversation (W9)", () => {
  it("creates a row with an active idle snapshot and seeds the bot greeting", async () => {
    repos.createConversation.mockResolvedValue({
      id: "convo-new",
      fsmSnapshot: { status: "active", value: "idle", context: {} },
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { startConversation } = await import("./orchestrator");
    const out = await startConversation("convo-new");

    expect(out.state).toBe("idle");
    expect(repos.createConversation).toHaveBeenCalledTimes(1);
    const [snapshotArg, idArg] = repos.createConversation.mock.calls[0]!;
    expect(idArg).toBe("convo-new");
    expect(snapshotArg).toMatchObject({ status: "active", value: "idle" });
    // The bot greeting goes through appendMessage on the new conversation.
    expect(repos.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "convo-new",
        role: "bot",
      }),
    );
  });
});

describe("dispatch — successful screening (W9)", () => {
  it("records the screening with model + latency from ScreenMeta", async () => {
    repos.getConversation.mockResolvedValue({
      id: "test-convo",
      fsmSnapshot: makeGatheringWithJdSnapshot(),
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Stub the AI module to resolve with a valid result.
    const screenMod = await import("@/lib/ai/screen");
    vi.mocked(screenMod.screen).mockResolvedValueOnce({
      result: FAKE_RESULT,
      model: "anthropic/claude-sonnet-4.6",
      latencyMs: 1234,
    });

    const { dispatch } = await import("./orchestrator");
    const out = await dispatch({
      conversationId: "test-convo",
      event: { type: "PROVIDE_CV", text: "Elena Kowalski, 6y TS" },
      userMessage: "Elena Kowalski, 6y TS",
    });

    expect(out.result).toEqual(FAKE_RESULT);
    expect(repos.recordScreening).toHaveBeenCalledTimes(1);
    expect(repos.recordScreening).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "test-convo",
        model: "anthropic/claude-sonnet-4.6",
        latencyMs: 1234,
        result: FAKE_RESULT,
      }),
    );
    // appendMessage called twice: user input + bot reply.
    expect(repos.appendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("dispatch — concurrent modification (W19')", () => {
  it("propagates ConcurrentModificationError when the CAS write fails", async () => {
    repos.getConversation.mockResolvedValue({
      id: "test-convo",
      fsmSnapshot: makeGatheringWithJdSnapshot(),
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const screenMod = await import("@/lib/ai/screen");
    vi.mocked(screenMod.screen).mockResolvedValueOnce({
      result: FAKE_RESULT,
      model: "fake/local",
      latencyMs: 1,
    });

    // Another request beat us to the write — CAS returns zero rows.
    const cmErr = new repos.ConcurrentModificationError("test-convo", 5);
    repos.updateConversationSnapshotIfVersion.mockRejectedValueOnce(cmErr);

    const { dispatch } = await import("./orchestrator");
    await expect(
      dispatch({
        conversationId: "test-convo",
        event: { type: "PROVIDE_CV", text: "Elena" },
        userMessage: "Elena",
      }),
    ).rejects.toBeInstanceOf(repos.ConcurrentModificationError);

    // recordScreening must not run after CAS fails — the LLM ran but the
    // state we'd reference is stale.
    expect(repos.recordScreening).not.toHaveBeenCalled();
  });

  it("calls CAS update with the version read from getConversation", async () => {
    repos.getConversation.mockResolvedValue({
      id: "test-convo",
      fsmSnapshot: makeGatheringWithJdSnapshot(),
      version: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const screenMod = await import("@/lib/ai/screen");
    vi.mocked(screenMod.screen).mockResolvedValueOnce({
      result: FAKE_RESULT,
      model: "fake/local",
      latencyMs: 1,
    });

    const { dispatch } = await import("./orchestrator");
    await dispatch({
      conversationId: "test-convo",
      event: { type: "PROVIDE_CV", text: "Elena" },
      userMessage: "Elena",
    });

    expect(repos.updateConversationSnapshotIfVersion).toHaveBeenCalledWith(
      "test-convo",
      expect.objectContaining({ status: "active" }),
      7,
    );
  });
});

describe("dispatch — AI failure (W9)", () => {
  it("returns to idle, surfaces the error, does not record a screening", async () => {
    repos.getConversation.mockResolvedValue({
      id: "test-convo",
      fsmSnapshot: makeGatheringWithJdSnapshot(),
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const screenMod = await import("@/lib/ai/screen");
    vi.mocked(screenMod.screen).mockRejectedValueOnce(
      new Error("OpenRouter 503"),
    );

    const { dispatch } = await import("./orchestrator");
    const out = await dispatch({
      conversationId: "test-convo",
      event: { type: "PROVIDE_CV", text: "Elena Kowalski" },
      userMessage: "Elena Kowalski",
    });

    expect(out.state).toBe("idle");
    expect(out.error).toBe("OpenRouter 503");
    expect(out.result).toBeUndefined();
    expect(repos.recordScreening).not.toHaveBeenCalled();
    // The bot reply should mention the failure (renderReply prefixes with
    // "Sorry, the screening failed:").
    const botReplyCall = repos.appendMessage.mock.calls.find(
      (c) => (c[0] as { role: string }).role === "bot",
    );
    expect(botReplyCall).toBeDefined();
    expect((botReplyCall![0] as { content: string }).content).toMatch(
      /screening failed/i,
    );
  });
});
