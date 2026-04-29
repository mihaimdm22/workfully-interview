import { assign, fromPromise, setup } from "xstate";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Bot finite state machine.
 *
 * IDLE  ───start_screening──▶  SCREENING ─┬─ awaitingJD
 *  ▲                                      ├─ awaitingCV
 *  │                                      ├─ evaluating  (invokes screening actor)
 *  │                                      └─ presentingResult ──reset──▶ IDLE
 *  │
 *  └─start_job_builder──▶  JOB_BUILDER ──cancel/reset──▶ IDLE
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
  },
  guards: {
    hasNonEmptyText: ({ event }) =>
      event.type === "PROVIDE_TEXT" && event.text.trim().length > 0,
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
      },
    },

    screening: {
      initial: "awaitingJobDescription",
      on: {
        CANCEL: { target: "idle", actions: "clearScreening" },
        RESET: { target: "idle", actions: "clearScreening" },
      },
      states: {
        awaitingJobDescription: {
          on: {
            PROVIDE_TEXT: {
              guard: "hasNonEmptyText",
              target: "awaitingCv",
              actions: assign({
                jobDescription: ({ event }) => event.text,
              }),
            },
          },
        },
        awaitingCv: {
          on: {
            PROVIDE_TEXT: {
              guard: "hasNonEmptyText",
              target: "evaluating",
              actions: assign({
                cv: ({ event }) => event.text,
              }),
            },
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
              target: "awaitingJobDescription",
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
