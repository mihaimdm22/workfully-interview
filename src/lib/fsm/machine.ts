import { assign, fromPromise, setup } from "xstate";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Bot finite state machine.
 *
 * IDLE  ──PROVIDE_JD / PROVIDE_CV / START_SCREENING──▶  SCREENING ─┬─ gathering   (waits for JD + CV in any order)
 *  ▲                                                                ├─ evaluating  (invokes screening actor)
 *  │                                                                └─ presentingResult ──reset──▶ IDLE
 *  │
 *  └─START_JOB_BUILDER──▶  JOB_BUILDER ──cancel/reset──▶ IDLE
 *
 * `gathering` accepts both `PROVIDE_JD` and `PROVIDE_CV` and auto-advances to
 * `evaluating` via an `always` guard once both slots are filled — so the demo
 * works whether the user uploads JD-then-CV, CV-then-JD, or pastes one and
 * uploads the other. `awaitingJobDescription` / `awaitingCv` remain as legacy
 * aliases so persisted snapshots from earlier versions rehydrate cleanly and
 * fall through to `gathering` on entry.
 *
 * `cancel` and `reset` are accepted at any sub-state of SCREENING and JOB_BUILDER.
 * The screening actor is provided externally (real AI in prod, mock in tests),
 * which keeps the machine pure and unit-testable.
 */

interface BotContext {
  conversationId: string;
  jobDescription?: string;
  cv?: string;
  result?: ScreeningResult;
  error?: string;
}

export type BotEvent =
  | { type: "START_SCREENING" }
  | { type: "START_JOB_BUILDER" }
  | { type: "CANCEL" }
  | { type: "RESET" }
  | { type: "PROVIDE_JD"; text: string }
  | { type: "PROVIDE_CV"; text: string }
  | { type: "PROVIDE_TEXT"; text: string };

interface BotInput {
  conversationId: string;
}

interface ScreeningActorInput {
  jobDescription: string;
  cv: string;
}

export const botMachine = setup({
  types: {
    context: {} as BotContext,
    events: {} as BotEvent,
    input: {} as BotInput,
  },
  actors: {
    /**
     * Screening actor. Default implementation throws so consumers must provide
     * a real one via `botMachine.provide({ actors: { screen: ... } })`.
     */
    screen: fromPromise<ScreeningResult, ScreeningActorInput>(async () => {
      throw new Error(
        "No screening actor provided. Call botMachine.provide({ actors: { screen } }) before createActor.",
      );
    }),
  },
  actions: {
    /** Wipes everything — used on /cancel and /reset where we want a clean idle. */
    clearScreening: assign({
      jobDescription: undefined,
      cv: undefined,
      result: undefined,
      error: undefined,
    }),
    /** Clears JD/CV but preserves the error message — used on AI failure so we can show it. */
    clearScreeningInputsKeepError: assign({
      jobDescription: undefined,
      cv: undefined,
      result: undefined,
    }),
    /** Sets jobDescription from event.text. */
    setJd: assign({
      jobDescription: ({ event }) => ("text" in event ? event.text : undefined),
    }),
    /** Sets cv from event.text. */
    setCv: assign({
      cv: ({ event }) => ("text" in event ? event.text : undefined),
    }),
    /**
     * Fills whichever slot is empty. Defaults to JD first so legacy callers
     * sending PROVIDE_TEXT continue to behave like the old linear flow when
     * starting from a clean state.
     */
    setMissing: assign(({ context, event }) => {
      if (!("text" in event)) return {};
      const text = event.text;
      const hasJd = !!context.jobDescription?.trim();
      const hasCv = !!context.cv?.trim();
      if (!hasJd) return { jobDescription: text };
      if (!hasCv) return { cv: text };
      // Both already set — nothing to fill.
      return {};
    }),
  },
  guards: {
    hasNonEmptyText: ({ event }) =>
      "text" in event && event.text.trim().length > 0,
    hasBoth: ({ context }) =>
      !!context.jobDescription?.trim() && !!context.cv?.trim(),
  },
}).createMachine({
  id: "bot",
  initial: "idle",
  context: ({ input }) => ({
    conversationId: input.conversationId,
  }),
  states: {
    idle: {
      on: {
        START_SCREENING: { target: "screening" },
        START_JOB_BUILDER: { target: "jobBuilder" },
        // An upload or paste while idle implicitly starts a screening with
        // that document already in hand. Filename inference (in actions.ts)
        // chooses PROVIDE_JD vs PROVIDE_CV; PROVIDE_TEXT is the fallback for
        // ambiguous filenames or pasted text.
        PROVIDE_JD: {
          guard: "hasNonEmptyText",
          target: "screening",
          actions: "setJd",
        },
        PROVIDE_CV: {
          guard: "hasNonEmptyText",
          target: "screening",
          actions: "setCv",
        },
        PROVIDE_TEXT: {
          guard: "hasNonEmptyText",
          target: "screening",
          actions: "setMissing",
        },
      },
    },

    screening: {
      initial: "gathering",
      on: {
        CANCEL: { target: "idle", actions: "clearScreening" },
        RESET: { target: "idle", actions: "clearScreening" },
      },
      states: {
        gathering: {
          // The moment both JD and CV are populated, kick off evaluation.
          always: { target: "evaluating", guard: "hasBoth" },
          on: {
            PROVIDE_JD: {
              guard: "hasNonEmptyText",
              actions: "setJd",
            },
            PROVIDE_CV: {
              guard: "hasNonEmptyText",
              actions: "setCv",
            },
            PROVIDE_TEXT: {
              guard: "hasNonEmptyText",
              actions: "setMissing",
            },
            // Re-issuing /screen mid-gather is a no-op (we're already
            // screening). The orchestrator will re-print the gathering prompt
            // so the user sees what's still needed. Use /reset to wipe slots.
          },
        },
        evaluating: {
          invoke: {
            src: "screen",
            input: ({ context }) => ({
              jobDescription: context.jobDescription ?? "",
              cv: context.cv ?? "",
            }),
            onDone: {
              target: "presentingResult",
              actions: assign({
                result: ({ event }) => event.output,
              }),
            },
            onError: {
              target: "#bot.idle",
              actions: [
                assign({
                  error: ({ event }) =>
                    event.error instanceof Error
                      ? event.error.message
                      : String(event.error),
                }),
                "clearScreeningInputsKeepError",
              ],
            },
          },
        },
        presentingResult: {
          on: {
            RESET: { target: "#bot.idle", actions: "clearScreening" },
            START_SCREENING: {
              target: "gathering",
              actions: "clearScreening",
            },
            START_JOB_BUILDER: {
              target: "#bot.jobBuilder",
              actions: "clearScreening",
            },
          },
        },
      },
    },

    jobBuilder: {
      on: {
        CANCEL: { target: "idle" },
        RESET: { target: "idle" },
      },
    },
  },
});
